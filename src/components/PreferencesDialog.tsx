import { useCallback, useMemo, useState } from 'react';
import { X, Settings, Sparkles, PenTool, Monitor } from 'lucide-react';
import { useEditor } from '../store/editor';
import { useT, useI18n, LANGUAGES, type Lang } from '../lib/i18n';
import { loadAIConfig, saveAIConfig, type AIConfig } from '../lib/ai';
import { loadPreferences, savePreferences, type AppPreferences } from '../lib/preferences';
import { useEscapeClose } from '../lib/hooks/useEscapeClose';
import { useFocusRestore } from '../lib/hooks/useFocusRestore';

/**
 * Preferences dialog — the canonical, app-level surface for every global
 * setting in Anchorworks. Distinct from `DocSettingsDialog` (which edits
 * the *current* document) and `AIPanel`'s gear icon (which keeps a Quick AI
 * sub-modal for in-context tweaks). Open via Help → Preferences…, Ctrl+,,
 * or the command palette.
 *
 * Layout: vertical tab rail on the left, single form on the right. Cancel
 * discards in-memory edits; Apply persists without closing; Save persists +
 * closes.
 *
 * Persistence map:
 *  - AI config            → `lib/ai.ts` (`saveAIConfig`)
 *  - Default doc / autosave → `lib/preferences.ts` (`savePreferences`)
 *  - Theme / high contrast / snap flags → live store writes (no extra IO)
 *  - Language             → `useI18n.setLang` (persisted via zustand middleware)
 *
 * The dialog deliberately re-presents settings that live elsewhere — that's
 * the entire point of consolidation. The original entry points (AI panel
 * gear, View menu Theme item, etc.) stay where they are for muscle memory.
 */

type TabId = 'general' | 'ai' | 'editor' | 'workspace';

interface DraftState {
  prefs: AppPreferences;
  ai: AIConfig;
  lang: Lang;
  /** Theme is selected as dark | light | system; "system" maps to whichever
   *  the OS prefers at apply-time. Stored as `dark | light` in the editor
   *  store (matching the existing `theme` field).
   */
  themeChoice: 'dark' | 'light' | 'system';
  highContrast: boolean;
  snapEnabled: boolean;
  smartGuides: boolean;
  anchorSnap: boolean;
}

function readSystemTheme(): 'dark' | 'light' {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return 'dark';
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

/**
 * Snapshot the live store + persisted blobs into a fresh draft. Done on
 * each `open` so reopening always reflects the current truth.
 */
function makeDraft(): DraftState {
  const s = useEditor.getState();
  const ai = loadAIConfig();
  return {
    prefs: loadPreferences(),
    ai,
    lang: useI18n.getState().lang,
    // We don't store a "system" preference today — opening the dialog after
    // an explicit choice just shows that choice, not "system".
    themeChoice: s.theme,
    highContrast: s.highContrast,
    snapEnabled: s.snapEnabled,
    smartGuides: s.smartGuidesEnabled,
    anchorSnap: s.anchorSnapEnabled,
  };
}

export function PreferencesDialog() {
  const t = useT();
  const open = useEditor((s) => s.showPreferences);
  const close = useCallback(() => useEditor.getState().setModal('showPreferences', false), []);

  const [tab, setTab] = useState<TabId>('general');
  const [draft, setDraft] = useState<DraftState>(() => makeDraft());

  // Re-seed the draft each time the dialog opens so external store changes
  // (e.g. theme toggled via Help menu) are reflected on next open. Track the
  // prop during render to avoid the setState-in-effect cascade.
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setDraft(makeDraft());
      setTab('general');
    }
  }

  // Close on Escape — capture phase, consistent with the rest of the dialog
  // system. Ensures input-fields inside (API key, autosave seconds, colour
  // picker) can't accidentally swallow Escape.
  useEscapeClose(open, close);

  useFocusRestore(open);

  // Persist the draft. Returns the (possibly mutated) prefs so callers can
  // see the resolved values if needed.
  const apply = () => {
    // 1. App preferences (default canvas, autosave).
    savePreferences(draft.prefs);
    // 2. AI config — full object roundtrip, mirrors AIPanel's sub-modal.
    saveAIConfig(draft.ai);
    // 3. Language.
    useI18n.getState().setLang(draft.lang);
    // 4. Store-backed toggles.
    const s = useEditor.getState();
    const resolvedTheme: 'dark' | 'light' =
      draft.themeChoice === 'system' ? readSystemTheme() : draft.themeChoice;
    if (s.theme !== resolvedTheme) s.setTheme(resolvedTheme);
    if (s.highContrast !== draft.highContrast) s.setHighContrast(draft.highContrast);
    if (s.snapEnabled !== draft.snapEnabled) s.setSnapEnabled(draft.snapEnabled);
    if (s.smartGuidesEnabled !== draft.smartGuides) s.setSmartGuidesEnabled(draft.smartGuides);
    if (s.anchorSnapEnabled !== draft.anchorSnap) s.setAnchorSnapEnabled(draft.anchorSnap);
  };

  const onSave = () => { apply(); close(); };
  const onApply = () => { apply(); };

  // Update a slice of the draft without smashing the rest.
  const patch = useMemo(() => ({
    prefs: (p: Partial<AppPreferences>) =>
      setDraft((d) => ({ ...d, prefs: { ...d.prefs, ...p } })),
    ai: (p: Partial<AIConfig>) =>
      setDraft((d) => ({ ...d, ai: { ...d.ai, ...p } })),
    top: (p: Partial<DraftState>) =>
      setDraft((d) => ({ ...d, ...p })),
  }), []);

  if (!open) return null;

  const tabs: Array<{ id: TabId; label: string; icon: React.ComponentType<{ size?: number; 'aria-hidden'?: boolean }> }> = [
    { id: 'general',   label: t('General'),   icon: Settings },
    { id: 'ai',        label: t('AI'),        icon: Sparkles },
    { id: 'editor',    label: t('Editor'),    icon: PenTool },
    { id: 'workspace', label: t('Workspace'), icon: Monitor },
  ];

  /** WAI-ARIA tabs pattern: vertical tablist responds to Up/Down to switch
   * tabs, Home/End to jump to first/last. The visible focus + selection sync
   * together (manual activation is also valid; we use auto-select for
   * snappier UX since the panels are inexpensive to render). */
  const onTabKeyDown = (e: React.KeyboardEvent) => {
    if (!['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(e.key)) return;
    e.preventDefault();
    const idx = tabs.findIndex((tb) => tb.id === tab);
    let next = idx;
    if (e.key === 'ArrowDown') next = (idx + 1) % tabs.length;
    else if (e.key === 'ArrowUp') next = (idx - 1 + tabs.length) % tabs.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = tabs.length - 1;
    if (next === idx) return;
    setTab(tabs[next].id);
    document.getElementById(`pref-tab-${tabs[next].id}`)?.focus();
  };

  return (
    <div
      className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm flex items-center justify-center"
      onClick={close}
      role="dialog"
      aria-modal="true"
      aria-labelledby="prefs-dialog-title"
    >
      <div
        className="w-[640px] max-w-[95vw] max-h-[80vh] bg-panel border border-border rounded-lg shadow-2xl overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-border bg-panel2 shrink-0">
          <h2 id="prefs-dialog-title" className="dialog-title">{t('Preferences')}</h2>
          <button
            onClick={close}
            className="btn-dialog-close"
            aria-label={t('Close')}
          >
            <X size={14} aria-hidden="true" />
          </button>
        </div>

        {/* Body: vertical tabs + form */}
        <div className="flex flex-1 min-h-0">
          <nav
            className="w-[140px] shrink-0 bg-panel2 border-r border-border py-2 flex flex-col"
            role="tablist"
            aria-label={t('Preferences')}
            aria-orientation="vertical"
            onKeyDown={onTabKeyDown}
          >
            {tabs.map((tb) => {
              const Icon = tb.icon;
              const active = tab === tb.id;
              return (
                <button
                  key={tb.id}
                  id={`pref-tab-${tb.id}`}
                  role="tab"
                  aria-selected={active}
                  aria-controls="pref-tab-panel"
                  tabIndex={active ? 0 : -1}
                  onClick={() => setTab(tb.id)}
                  className={`flex items-center gap-2 px-3 py-1.5 text-xs text-left transition-colors ${
                    active
                      ? 'bg-panel3 text-ink border-l-2 border-accent2 pl-[10px]'
                      : 'text-muted hover:text-ink hover:bg-panel3/60'
                  }`}
                >
                  <Icon size={13} aria-hidden={true} />
                  <span>{tb.label}</span>
                </button>
              );
            })}
          </nav>

          <div
            id="pref-tab-panel"
            role="tabpanel"
            aria-labelledby={`pref-tab-${tab}`}
            tabIndex={0}
            className="flex-1 overflow-y-auto px-5 py-4 min-w-0 focus:outline-none"
          >
            {tab === 'general' && <GeneralTab draft={draft} patch={patch} />}
            {tab === 'ai' && <AITab draft={draft} patch={patch} />}
            {tab === 'editor' && <EditorTab draft={draft} patch={patch} />}
            {tab === 'workspace' && <WorkspaceTab draft={draft} patch={patch} />}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-border bg-panel2 shrink-0">
          <button className="btn" onClick={close}>{t('Cancel')}</button>
          <button className="btn" onClick={onApply}>{t('Apply')}</button>
          <button className="btn-primary" onClick={onSave}>{t('Save')}</button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tabs
// ---------------------------------------------------------------------------

interface PatchAPI {
  prefs: (p: Partial<AppPreferences>) => void;
  ai: (p: Partial<AIConfig>) => void;
  top: (p: Partial<DraftState>) => void;
}

function GeneralTab({ draft, patch }: { draft: DraftState; patch: PatchAPI }) {
  const t = useT();
  return (
    <div className="space-y-4">
      <Field label={t('Language')}>
        <select
          className="input-num"
          value={draft.lang}
          onChange={(e) => patch.top({ lang: e.target.value as Lang })}
        >
          {LANGUAGES.map((l) => (
            <option key={l} value={l}>{l === 'zh' ? '中文' : 'English'}</option>
          ))}
        </select>
      </Field>

      <Field label={t('Default theme')}>
        <select
          className="input-num"
          value={draft.themeChoice}
          onChange={(e) => patch.top({ themeChoice: e.target.value as 'dark' | 'light' | 'system' })}
        >
          <option value="system">{t('System')}</option>
          <option value="dark">{t('Dark Theme')}</option>
          <option value="light">{t('Light Theme')}</option>
        </select>
      </Field>

      <Section title={t('Default canvas size')}>
        <div className="grid grid-cols-2 gap-2">
          <Field label={t('Width')}>
            <input
              type="number"
              min={1}
              className="input-num"
              value={draft.prefs.defaultDocWidth}
              onChange={(e) => patch.prefs({ defaultDocWidth: +e.target.value })}
            />
          </Field>
          <Field label={t('Height')}>
            <input
              type="number"
              min={1}
              className="input-num"
              value={draft.prefs.defaultDocHeight}
              onChange={(e) => patch.prefs({ defaultDocHeight: +e.target.value })}
            />
          </Field>
        </div>
        <Field label={t('Background')}>
          {/* Native color input — `.input-num` framing gives it the same
           * panel-bg + border + radius as the sibling text inputs so the
           * Field reads as one form, not "two inputs + a stray swatch". The
           * inner pixel is the browser-rendered swatch; padding compresses
           * around it so the overall box height matches the other fields. */}
          <input
            type="color"
            value={draft.prefs.defaultDocBackground}
            onChange={(e) => patch.prefs({ defaultDocBackground: e.target.value })}
            className="input-num p-0.5 h-7 w-12 cursor-pointer"
            aria-label={t('Background')}
          />
        </Field>
      </Section>

      <Field label={t('Autosave interval (seconds)')}>
        <input
          type="number"
          min={0}
          step={1}
          className="input-num"
          value={Math.round(draft.prefs.autosaveIntervalMs / 1000)}
          onChange={(e) => {
            const sec = Math.max(0, Math.floor(+e.target.value || 0));
            patch.prefs({ autosaveIntervalMs: sec * 1000 });
          }}
        />
      </Field>
    </div>
  );
}

function AITab({ draft, patch }: { draft: DraftState; patch: PatchAPI }) {
  const t = useT();
  return (
    <div className="space-y-3">
      <Field label={t('API key')}>
        {/* Same treatment as the AIPanel API key input — see AIPanel.tsx
         * for the autoComplete / spellCheck rationale. API keys aren't
         * credentials; suppress browser autofill + password-manager save. */}
        <input
          type="password"
          autoComplete="off"
          spellCheck={false}
          className="input-num"
          value={draft.ai.apiKey}
          onChange={(e) => patch.ai({ apiKey: e.target.value })}
          placeholder="sk-ant-…"
        />
      </Field>
      <Field label={t('Model')}>
        <select
          className="input-num"
          value={draft.ai.model}
          onChange={(e) => patch.ai({ model: e.target.value })}
        >
          <option value="claude-opus-4-7">Claude Opus 4.7 ({t('best')})</option>
          <option value="claude-sonnet-4-6">Claude Sonnet 4.6 ({t('balanced')})</option>
          <option value="claude-haiku-4-5-20251001">Claude Haiku 4.5 ({t('fast')})</option>
        </select>
      </Field>
      <Field label={t('Base URL')}>
        <input
          type="url"
          className="input-num"
          value={draft.ai.baseUrl}
          onChange={(e) => patch.ai({ baseUrl: e.target.value })}
          spellCheck={false}
          autoComplete="off"
        />
      </Field>
      <Toggle
        checked={draft.ai.enableVision}
        onChange={(v) => patch.ai({ enableVision: v })}
        label={t('Vision')}
      />
      <Toggle
        checked={draft.ai.streaming !== false}
        onChange={(v) => patch.ai({ streaming: v })}
        label={t('Stream responses')}
      />
    </div>
  );
}

function EditorTab({ draft, patch }: { draft: DraftState; patch: PatchAPI }) {
  const t = useT();
  return (
    <div className="space-y-3">
      <Toggle
        checked={draft.snapEnabled}
        onChange={(v) => patch.top({ snapEnabled: v })}
        label={t('Snap to Grid')}
      />
      <Toggle
        checked={draft.smartGuides}
        onChange={(v) => patch.top({ smartGuides: v })}
        label={t('Smart Guides')}
      />
      <Toggle
        checked={draft.anchorSnap}
        onChange={(v) => patch.top({ anchorSnap: v })}
        label={t('Snap to anchor points')}
      />
    </div>
  );
}

function WorkspaceTab({ draft, patch }: { draft: DraftState; patch: PatchAPI }) {
  const t = useT();
  return (
    <div className="space-y-3">
      <Field label={t('Default theme')}>
        <select
          className="input-num"
          value={draft.themeChoice}
          onChange={(e) => patch.top({ themeChoice: e.target.value as 'dark' | 'light' | 'system' })}
        >
          <option value="system">{t('System')}</option>
          <option value="dark">{t('Dark Theme')}</option>
          <option value="light">{t('Light Theme')}</option>
        </select>
      </Field>
      <Toggle
        checked={draft.highContrast}
        onChange={(v) => patch.top({ highContrast: v })}
        label={t('High contrast')}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Layout primitives
// ---------------------------------------------------------------------------

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="field-label">{label}</div>
      {children}
    </label>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border border-border rounded p-3 space-y-2 bg-panel2/40">
      <h3 className="field-label">{title}</h3>
      {children}
    </div>
  );
}

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="flex items-center gap-2 text-xs text-ink cursor-pointer">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span>{label}</span>
    </label>
  );
}
