import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { ReactElement } from 'react';
import { DebugPanel } from '../../DebugPanel';
import { AIPanel } from '../../AIPanel';
import { clearLog } from '../../../lib/debug';

/**
 * Freeze-then-migrate suite for the last two panel holdouts (implementer Y):
 * DebugPanel's diagnostics toolbar and AIPanel's eight [data-ai-action]
 * toolbars move onto the shared dialog-keyboard kit.
 *
 *   DebugPanel actions → makeRovingKeys({ wrap, skipDisabled, guardEmpty,
 *                          onNavigate }) inside an ActionToolbar whose built-in
 *                          live region replaces the hand-rolled sr-only div
 *                          (statusAs omitted — div is the default). The four
 *                          icon-only buttons stay verbatim as toolbar children:
 *                          their aria-label/title pair is exactly the gap-A
 *                          pass-through shape, and the announcement keeps
 *                          flowing through the panel's focusedAction state
 *                          machine, so onNavigate — not setReview — publishes.
 *   AIPanel (8 toolbars,
 *   1 shared handler)  → makeRovingKeys({ wrap, skipDisabled, guardEmpty })
 *                          with the interactive-target guard kept as a panel-
 *                          side wrapper (ArtboardsPanel precedent): arrows
 *                          typed into the prompt textarea or the MCP server
 *                          inputs/selects keep their native meaning. The
 *                          containers stay hand-rolled — none of the eight
 *                          has a review live region, and ActionToolbar's
 *                          contract mandates aria-describedby (a dangling
 *                          reference under externalStatus) or a brand-new
 *                          live region (announcements legacy never made).
 *
 * HEAD keyboard semantics, re-verified handler-by-handler from
 * `git show HEAD:src/components/DebugPanel.tsx` / `AIPanel.tsx` (both files
 * had an empty working-tree diff, so HEAD is the byte baseline):
 *
 *   DebugPanel handleDebugActionKeys — responds to ArrowLeft/Right/Home/End
 *   only; filters disabled/aria-disabled buttons; Math.max(0, indexOf(
 *   activeElement)) active-index fallback; arrows WRAP ((i ± 1 + n) % n);
 *   Home/End hit the absolute ends; preventDefault AFTER the empty-guard;
 *   setFocusedAction(next.dataset.debugAction) BEFORE the synchronous focus
 *   (the button's onFocus re-publishes the same action).
 *
 *   AIPanel handleAIActionKeys — same roving body with one extra pre-guard:
 *   target.matches('input, textarea, select, [contenteditable="true"]')
 *   returns without preventDefault (arrows stay text-navigation inside the
 *   prompt textarea and the MCP server rows). No review announcements.
 *
 * One intended behavioral delta is pinned below (prompt-toolbar empty set):
 * the kit preventDefaults before its guardEmpty bail-out while HEAD returned
 * first — only observable for synthetic keydowns dispatched on the container
 * itself, since a disabled button cannot hold focus and the container is not
 * focusable. Every other frozen string must serialize byte-identically; the
 * full behavior snapshots passed green against the LEGACY handlers before
 * the migration was applied.
 */

vi.mock('../../../lib/ai', () => ({
  loadAIConfig: vi.fn(() => ({ apiKey: 'sk-test-key', model: 'claude-sonnet-4-6', baseUrl: '', enableVision: true, streaming: true })),
  saveAIConfig: vi.fn(),
  chatWithClaude: vi.fn(async () => ({ text: 'ok', actions: [], errors: [] })),
  chatWithClaudeStreaming: vi.fn(() => new Promise(() => {})),
}));
vi.mock('../../../lib/mcp', () => ({
  listSkills: vi.fn(() => []),
  loadMCPServers: vi.fn(() => []),
  saveMCPServers: vi.fn(),
  probeMCPServer: vi.fn(() => new Promise(() => {})),
  discoverMCPTools: vi.fn(async () => ({ servers: 0, tools: 0, failures: [] })),
  getCachedMCPTools: vi.fn(() => []),
}));
vi.mock('../../../lib/toast', () => ({ toast: { success: vi.fn(), warn: vi.fn(), error: vi.fn(), info: vi.fn(), show: vi.fn() } }));
vi.mock('../../../lib/canvasEngine', () => ({ getCanvas: vi.fn(() => null) }));
vi.mock('../../../lib/keymap', () => ({ snapshotKeymap: vi.fn(() => ({ version: 1 })) }));
vi.mock('../../../lib/runtime', () => ({ isTauri: vi.fn(() => false) }));
vi.mock('../../../lib/io', () => ({ download: vi.fn() }));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let roots: Root[];

beforeEach(() => {
  host = document.createElement('div');
  document.body.appendChild(host);
  roots = [];
  clearLog(); // DebugPanel consumes the real lib/debug buffer
  // jsdom does not implement Element scrolling — AIPanel auto-scrolls the
  // chat history on mount. Neutral no-op shim, removed after each test.
  Element.prototype.scrollTo = () => {};
});

afterEach(() => {
  for (const root of roots) act(() => root.unmount());
  host.remove();
  delete (Element.prototype as { scrollTo?: unknown }).scrollTo;
});

function mount(element: ReactElement): HTMLElement {
  const container = document.createElement('div');
  host.appendChild(container);
  const root = createRoot(container);
  roots.push(root);
  act(() => root.render(element));
  return container.firstElementChild as HTMLElement;
}

const mountDebug = () => mount(<DebugPanel onClose={() => {}} />);
const mountAI = () => mount(<AIPanel onClose={() => {}} />);

/** Opens the MCP Servers & Skills modal and adds one server row. */
function mountAIWithServerRow(): { panel: HTMLElement; row: HTMLElement } {
  const panel = mountAI();
  act(() => panel.querySelector<HTMLButtonElement>('[aria-label="MCP / Skills"]')!.dispatchEvent(new MouseEvent('click', { bubbles: true })));
  const addBtn = Array.from(panel.querySelectorAll<HTMLButtonElement>('button')).find(b => b.textContent === '+ Add')!;
  act(() => addBtn.dispatchEvent(new MouseEvent('click', { bubbles: true })));
  const row = panel.querySelector<HTMLElement>('[aria-label^="MCP server actions"]')!;
  return { panel, row };
}

// ---- helpers --------------------------------------------------------------------

const press = (target: HTMLElement, key: string): KeyboardEvent => {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
  act(() => { target.dispatchEvent(event); });
  return event;
};
const reviewText = (id: string): string | null => document.getElementById(id)?.textContent ?? null;
const regionByLabel = (root: HTMLElement, label: string) =>
  root.querySelector<HTMLElement>(`div[role="toolbar"][aria-label="${label}"]`)!;

// ---- frozen DOM (captured from the LEGACY panels; byte-identity) ------------------

const FROZEN_DEBUG_PANEL =
  '<div class="h-56 border-t border-border bg-panel text-xs flex flex-col"><div class="h-8 border-b border-border flex items-center px-2 gap-1"><div role="tablist" aria-label="Debug" aria-orientation="horizontal" class="flex items-center gap-1"><button id="debug-tab-log" role="tab" aria-selected="true" aria-controls="debug-tab-panel" tabindex="0" class="px-2 py-0.5 rounded transition-colors bg-panel3 text-ink">log</button><button id="debug-tab-state" role="tab" aria-selected="false" aria-controls="debug-tab-panel" tabindex="-1" class="px-2 py-0.5 rounded transition-colors text-muted hover:text-ink">state</button><button id="debug-tab-perf" role="tab" aria-selected="false" aria-controls="debug-tab-panel" tabindex="-1" class="px-2 py-0.5 rounded transition-colors text-muted hover:text-ink">perf</button><button id="debug-tab-keymap" role="tab" aria-selected="false" aria-controls="debug-tab-panel" tabindex="-1" class="px-2 py-0.5 rounded transition-colors text-muted hover:text-ink">keymap</button></div><div class="ml-auto flex items-center gap-1" role="toolbar" aria-label="Debug actions" aria-describedby="debug-action-review-status" title="Use arrow keys to review debug actions"><div id="debug-action-review-status" class="sr-only" aria-live="polite">Reviewing Copy diagnostics</div><button data-debug-action="simulate" class="text-muted hover:text-ink p-1 transition-colors" aria-label="Simulate error" title="Simulate error"><svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-bug" aria-hidden="true"><path d="M12 20v-9"></path><path d="M14 7a4 4 0 0 1 4 4v3a6 6 0 0 1-12 0v-3a4 4 0 0 1 4-4z"></path><path d="M14.12 3.88 16 2"></path><path d="M21 21a4 4 0 0 0-3.81-4"></path><path d="M21 5a4 4 0 0 1-3.55 3.97"></path><path d="M22 13h-4"></path><path d="M3 21a4 4 0 0 1 3.81-4"></path><path d="M3 5a4 4 0 0 0 3.55 3.97"></path><path d="M6 13H2"></path><path d="m8 2 1.88 1.88"></path><path d="M9 7.13V6a3 3 0 1 1 6 0v1.13"></path></svg></button><button data-debug-action="errorLog" class="text-muted hover:text-ink p-1 transition-colors" aria-label="Open error log" title="Open error log"><svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-scroll-text" aria-hidden="true"><path d="M15 12h-5"></path><path d="M15 8h-5"></path><path d="M19 17V5a2 2 0 0 0-2-2H4"></path><path d="M8 21h12a2 2 0 0 0 2-2v-1a1 1 0 0 0-1-1H11a1 1 0 0 0-1 1v1a2 2 0 1 1-4 0V5a2 2 0 1 0-4 0v2a1 1 0 0 0 1 1h3"></path></svg></button><button data-debug-action="copy" class="text-muted hover:text-ink p-1 transition-colors" aria-label="Copy diagnostics" title="Copy diagnostics"><svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-copy" aria-hidden="true"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"></rect><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"></path></svg></button><button data-debug-action="download" class="text-muted hover:text-ink p-1 transition-colors" aria-label="Download diagnostics" title="Download diagnostics"><svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-download" aria-hidden="true"><path d="M12 15V3"></path><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><path d="m7 10 5 5 5-5"></path></svg></button><button data-debug-action="clear" class="text-muted hover:text-ink p-1 transition-colors" aria-label="Clear log" title="Clear log"><svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-trash2 lucide-trash-2" aria-hidden="true"><path d="M10 11v6"></path><path d="M14 11v6"></path><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"></path><path d="M3 6h18"></path><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg></button><button data-debug-action="close" class="text-muted hover:text-ink p-1 transition-colors" aria-label="Close"><svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-x" aria-hidden="true"><path d="M18 6 6 18"></path><path d="m6 6 12 12"></path></svg></button></div></div><div id="debug-tab-panel" class="flex-1 overflow-auto font-mono text-[10px] leading-tight" role="tabpanel" aria-labelledby="debug-tab-log"><div class="p-3 text-muted">No log entries.</div></div></div>';

const FROZEN_DEBUG_TOOLBAR =
  '<div class="ml-auto flex items-center gap-1" role="toolbar" aria-label="Debug actions" aria-describedby="debug-action-review-status" title="Use arrow keys to review debug actions"><div id="debug-action-review-status" class="sr-only" aria-live="polite">Reviewing Copy diagnostics</div><button data-debug-action="simulate" class="text-muted hover:text-ink p-1 transition-colors" aria-label="Simulate error" title="Simulate error"><svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-bug" aria-hidden="true"><path d="M12 20v-9"></path><path d="M14 7a4 4 0 0 1 4 4v3a6 6 0 0 1-12 0v-3a4 4 0 0 1 4-4z"></path><path d="M14.12 3.88 16 2"></path><path d="M21 21a4 4 0 0 0-3.81-4"></path><path d="M21 5a4 4 0 0 1-3.55 3.97"></path><path d="M22 13h-4"></path><path d="M3 21a4 4 0 0 1 3.81-4"></path><path d="M3 5a4 4 0 0 0 3.55 3.97"></path><path d="M6 13H2"></path><path d="m8 2 1.88 1.88"></path><path d="M9 7.13V6a3 3 0 1 1 6 0v1.13"></path></svg></button><button data-debug-action="errorLog" class="text-muted hover:text-ink p-1 transition-colors" aria-label="Open error log" title="Open error log"><svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-scroll-text" aria-hidden="true"><path d="M15 12h-5"></path><path d="M15 8h-5"></path><path d="M19 17V5a2 2 0 0 0-2-2H4"></path><path d="M8 21h12a2 2 0 0 0 2-2v-1a1 1 0 0 0-1-1H11a1 1 0 0 0-1 1v1a2 2 0 1 1-4 0V5a2 2 0 1 0-4 0v2a1 1 0 0 0 1 1h3"></path></svg></button><button data-debug-action="copy" class="text-muted hover:text-ink p-1 transition-colors" aria-label="Copy diagnostics" title="Copy diagnostics"><svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-copy" aria-hidden="true"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"></rect><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"></path></svg></button><button data-debug-action="download" class="text-muted hover:text-ink p-1 transition-colors" aria-label="Download diagnostics" title="Download diagnostics"><svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-download" aria-hidden="true"><path d="M12 15V3"></path><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><path d="m7 10 5 5 5-5"></path></svg></button><button data-debug-action="clear" class="text-muted hover:text-ink p-1 transition-colors" aria-label="Clear log" title="Clear log"><svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-trash2 lucide-trash-2" aria-hidden="true"><path d="M10 11v6"></path><path d="M14 11v6"></path><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"></path><path d="M3 6h18"></path><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg></button><button data-debug-action="close" class="text-muted hover:text-ink p-1 transition-colors" aria-label="Close"><svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-x" aria-hidden="true"><path d="M18 6 6 18"></path><path d="m6 6 12 12"></path></svg></button></div>';

const FROZEN_AI_PANEL =
  '<div class="w-[380px] shrink-0 bg-panel border-l border-border flex flex-col text-xs"><div class="h-11 border-b border-border px-3 flex items-center justify-between"><h2 class="dialog-title flex items-center gap-2"><span class="relative inline-flex" aria-hidden="true"><span class="w-2 h-2 rounded-full bg-accent"></span><span class="absolute inset-0 w-2 h-2 rounded-full bg-accent animate-ping opacity-50"></span></span>AI Assistant</h2><div class="flex items-center gap-1" role="toolbar" aria-label="AI panel actions" title="Use arrow keys to review AI actions"><button data-ai-action="true" title="MCP / Skills" aria-label="MCP / Skills" class="btn-dialog-close"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-plug" aria-hidden="true"><path d="M12 22v-5"></path><path d="M15 8V2"></path><path d="M17 8a1 1 0 0 1 1 1v4a4 4 0 0 1-4 4h-4a4 4 0 0 1-4-4V9a1 1 0 0 1 1-1z"></path><path d="M9 8V2"></path></svg></button><button data-ai-action="true" title="AI Configuration" aria-label="AI Configuration" class="btn-dialog-close"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-settings" aria-hidden="true"><path d="M9.671 4.136a2.34 2.34 0 0 1 4.659 0 2.34 2.34 0 0 0 3.319 1.915 2.34 2.34 0 0 1 2.33 4.033 2.34 2.34 0 0 0 0 3.831 2.34 2.34 0 0 1-2.33 4.033 2.34 2.34 0 0 0-3.319 1.915 2.34 2.34 0 0 1-4.659 0 2.34 2.34 0 0 0-3.32-1.915 2.34 2.34 0 0 1-2.33-4.033 2.34 2.34 0 0 0 0-3.831A2.34 2.34 0 0 1 6.35 6.051a2.34 2.34 0 0 0 3.319-1.915"></path><circle cx="12" cy="12" r="3"></circle></svg></button><button data-ai-action="true" class="btn-dialog-close" aria-label="Close"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-x" aria-hidden="true"><path d="M18 6 6 18"></path><path d="m6 6 12 12"></path></svg></button></div></div><div class="border-b border-border px-2 py-2 flex flex-wrap gap-1" role="toolbar" aria-label="AI quick actions" title="Use arrow keys to review AI actions"><button data-ai-action="true" title="Critique the current canvas design. Give 3 concrete, actionable improvements (visual hierarchy, balance, color, spacing). Be specific about which elements to change." class="px-2 py-1 rounded border border-border text-[10px] hover:border-accent2 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:border-border transition-colors">✨ Critique design</button><button data-ai-action="true" title="Suggest a more harmonious color palette for the current canvas and apply it. Use set_fill / set_stroke on the existing shapes when possible rather than regenerating." class="px-2 py-1 rounded border border-border text-[10px] hover:border-accent2 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:border-border transition-colors">🎨 Better palette</button><button data-ai-action="true" title="Tidy up the alignment and spacing of the elements on this canvas. Use the align_objects and distribute_objects skills to perfectly align and evenly space everything. Do NOT regenerate any SVG." class="px-2 py-1 rounded border border-border text-[10px] hover:border-accent2 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:border-border transition-colors">📐 Tidy alignment</button><button data-ai-action="true" title="Convert the current canvas into a small, cohesive icon set — flat, line-based, consistent stroke widths, a unified palette. Replace the canvas with the new icon set as an SVG grid." class="px-2 py-1 rounded border border-border text-[10px] hover:border-accent2 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:border-border transition-colors">🧩 Convert to icon set</button></div><div class="flex-1 overflow-y-auto px-3 py-4 space-y-3"><div class="flex flex-col items-center text-center px-2 pt-6"><svg width="64" height="56" viewBox="0 0 64 56" fill="none" class="mb-3 opacity-80" aria-hidden="true" style="color: rgb(var(--color-muted));"><path d="M10.5 12.5 L 41.5 12.5 Q 45.5 12.5 45.5 16.5 L 45.5 32.5 Q 45.5 36.5 41.5 36.5 L 22 36.5 L 14 43 L 14 36.5 L 10.5 36.5 Q 6.5 36.5 6.5 32.5 L 6.5 16.5 Q 6.5 12.5 10.5 12.5 Z" stroke="currentColor" stroke-opacity="0.6" stroke-width="1" fill="none"></path><circle cx="17" cy="24.5" r="1.5" fill="currentColor"></circle><circle cx="26" cy="24.5" r="1.5" fill="currentColor"></circle><circle cx="35" cy="24.5" r="1.5" fill="currentColor"></circle><path d="M52 14 L 53 18 L 57 19 L 53 20 L 52 24 L 51 20 L 47 19 L 51 18 Z" fill="rgb(var(--color-accent))"></path><circle cx="56" cy="10" r="1.3" fill="rgb(var(--color-accent2))"></circle></svg><div class="type-title mb-1">Design with Claude</div><div class="type-caption leading-relaxed max-w-[260px] mb-4">Ask Claude to design, refine, or critique your artwork.</div><div class="w-full max-w-[280px] space-y-1.5"><button class="w-full text-left text-[11px] px-2.5 py-1.5 rounded-sm bg-panel2 border border-border text-muted hover:text-ink hover:border-accent2/40 transition-colors disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:text-muted disabled:hover:border-border">"Draw a minimalist mountain logo in two colors"</button><button class="w-full text-left text-[11px] px-2.5 py-1.5 rounded-sm bg-panel2 border border-border text-muted hover:text-ink hover:border-accent2/40 transition-colors disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:text-muted disabled:hover:border-border">"Make my shapes align in a row, equal spacing"</button><button class="w-full text-left text-[11px] px-2.5 py-1.5 rounded-sm bg-panel2 border border-border text-muted hover:text-ink hover:border-accent2/40 transition-colors disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:text-muted disabled:hover:border-border">"Suggest a better color palette and apply it"</button></div><p class="mt-4 text-[10px] text-muted/80">Model: claude-sonnet-4-6 · Vision: on · Streaming: on</p></div></div><div class="border-t border-border p-2 flex items-center gap-2 text-[10px]" role="toolbar" aria-label="AI context actions" title="Use arrow keys to review AI actions"><button data-ai-action="true" aria-pressed="true" class="flex items-center gap-1 px-2 py-1 rounded border border-accent text-ink"><svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-eye" aria-hidden="true"><path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0"></path><circle cx="12" cy="12" r="3"></circle></svg>Vision</button><button data-ai-action="true" aria-pressed="true" class="flex items-center gap-1 px-2 py-1 rounded border border-accent text-ink"><svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-code-xml" aria-hidden="true"><path d="m18 16 4-4-4-4"></path><path d="m6 8-4 4 4 4"></path><path d="m14.5 4-5 16"></path></svg>SVG</button><span class="flex items-center gap-1 px-2 py-1 rounded border border-accent2/40 bg-accent2/10 text-ink"><svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-zap" aria-hidden="true"><path d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z"></path></svg>Stream</span><span class="ml-auto text-muted">0 skills</span></div><div class="border-t border-border p-2 flex items-end gap-2" role="toolbar" aria-label="AI prompt actions" title="Use arrow keys to review AI actions"><textarea rows="2" placeholder="Describe an edit or design…" aria-label="Describe an edit or design…" class="flex-1 bg-panel2 border border-border rounded p-2 text-xs outline-none focus:border-accent2 resize-none disabled:opacity-50 disabled:cursor-not-allowed transition-colors"></textarea><button data-ai-action="true" disabled="" class="btn-primary" title="Send message" aria-label="Send message" aria-busy="false"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-send" aria-hidden="true"><path d="M14.536 21.686a.5.5 0 0 0 .937-.024l6.5-19a.496.496 0 0 0-.635-.635l-19 6.5a.5.5 0 0 0-.024.937l7.93 3.18a2 2 0 0 1 1.112 1.11z"></path><path d="m21.854 2.147-10.94 10.939"></path></svg></button></div></div>';

const FROZEN_AI_HEADER =
  '<div class="flex items-center gap-1" role="toolbar" aria-label="AI panel actions" title="Use arrow keys to review AI actions"><button data-ai-action="true" title="MCP / Skills" aria-label="MCP / Skills" class="btn-dialog-close"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-plug" aria-hidden="true"><path d="M12 22v-5"></path><path d="M15 8V2"></path><path d="M17 8a1 1 0 0 1 1 1v4a4 4 0 0 1-4 4h-4a4 4 0 0 1-4-4V9a1 1 0 0 1 1-1z"></path><path d="M9 8V2"></path></svg></button><button data-ai-action="true" title="AI Configuration" aria-label="AI Configuration" class="btn-dialog-close"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-settings" aria-hidden="true"><path d="M9.671 4.136a2.34 2.34 0 0 1 4.659 0 2.34 2.34 0 0 0 3.319 1.915 2.34 2.34 0 0 1 2.33 4.033 2.34 2.34 0 0 0 0 3.831 2.34 2.34 0 0 1-2.33 4.033 2.34 2.34 0 0 0-3.319 1.915 2.34 2.34 0 0 1-4.659 0 2.34 2.34 0 0 0-3.32-1.915 2.34 2.34 0 0 1-2.33-4.033 2.34 2.34 0 0 0 0-3.831A2.34 2.34 0 0 1 6.35 6.051a2.34 2.34 0 0 0 3.319-1.915"></path><circle cx="12" cy="12" r="3"></circle></svg></button><button data-ai-action="true" class="btn-dialog-close" aria-label="Close"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-x" aria-hidden="true"><path d="M18 6 6 18"></path><path d="m6 6 12 12"></path></svg></button></div>';

const FROZEN_AI_QUICK =
  '<div class="border-b border-border px-2 py-2 flex flex-wrap gap-1" role="toolbar" aria-label="AI quick actions" title="Use arrow keys to review AI actions"><button data-ai-action="true" title="Critique the current canvas design. Give 3 concrete, actionable improvements (visual hierarchy, balance, color, spacing). Be specific about which elements to change." class="px-2 py-1 rounded border border-border text-[10px] hover:border-accent2 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:border-border transition-colors">✨ Critique design</button><button data-ai-action="true" title="Suggest a more harmonious color palette for the current canvas and apply it. Use set_fill / set_stroke on the existing shapes when possible rather than regenerating." class="px-2 py-1 rounded border border-border text-[10px] hover:border-accent2 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:border-border transition-colors">🎨 Better palette</button><button data-ai-action="true" title="Tidy up the alignment and spacing of the elements on this canvas. Use the align_objects and distribute_objects skills to perfectly align and evenly space everything. Do NOT regenerate any SVG." class="px-2 py-1 rounded border border-border text-[10px] hover:border-accent2 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:border-border transition-colors">📐 Tidy alignment</button><button data-ai-action="true" title="Convert the current canvas into a small, cohesive icon set — flat, line-based, consistent stroke widths, a unified palette. Replace the canvas with the new icon set as an SVG grid." class="px-2 py-1 rounded border border-border text-[10px] hover:border-accent2 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:border-border transition-colors">🧩 Convert to icon set</button></div>';

const FROZEN_AI_CONTEXT =
  '<div class="border-t border-border p-2 flex items-center gap-2 text-[10px]" role="toolbar" aria-label="AI context actions" title="Use arrow keys to review AI actions"><button data-ai-action="true" aria-pressed="true" class="flex items-center gap-1 px-2 py-1 rounded border border-accent text-ink"><svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-eye" aria-hidden="true"><path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0"></path><circle cx="12" cy="12" r="3"></circle></svg>Vision</button><button data-ai-action="true" aria-pressed="true" class="flex items-center gap-1 px-2 py-1 rounded border border-accent text-ink"><svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-code-xml" aria-hidden="true"><path d="m18 16 4-4-4-4"></path><path d="m6 8-4 4 4 4"></path><path d="m14.5 4-5 16"></path></svg>SVG</button><span class="flex items-center gap-1 px-2 py-1 rounded border border-accent2/40 bg-accent2/10 text-ink"><svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-zap" aria-hidden="true"><path d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z"></path></svg>Stream</span><span class="ml-auto text-muted">0 skills</span></div>';

const FROZEN_AI_PROMPT =
  '<div class="border-t border-border p-2 flex items-end gap-2" role="toolbar" aria-label="AI prompt actions" title="Use arrow keys to review AI actions"><textarea rows="2" placeholder="Describe an edit or design…" aria-label="Describe an edit or design…" class="flex-1 bg-panel2 border border-border rounded p-2 text-xs outline-none focus:border-accent2 resize-none disabled:opacity-50 disabled:cursor-not-allowed transition-colors"></textarea><button data-ai-action="true" disabled="" class="btn-primary" title="Send message" aria-label="Send message" aria-busy="false"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-send" aria-hidden="true"><path d="M14.536 21.686a.5.5 0 0 0 .937-.024l6.5-19a.496.496 0 0 0-.635-.635l-19 6.5a.5.5 0 0 0-.024.937l7.93 3.18a2 2 0 0 1 1.112 1.11z"></path><path d="m21.854 2.147-10.94 10.939"></path></svg></button></div>';

const FROZEN_AI_CFG_FOOTER =
  '<div class="flex justify-end gap-2 mt-3" role="toolbar" aria-label="AI settings actions" title="Use arrow keys to review AI actions"><button type="button" data-ai-action="true" class="btn">Cancel</button><button type="button" data-ai-action="true" class="btn-primary">Save</button></div>';

const FROZEN_AI_MCP_DISCOVERY =
  '<div class="flex items-center gap-1" role="toolbar" aria-label="MCP discovery actions" title="Use arrow keys to review AI actions"><button data-ai-action="true" class="btn inline-flex items-center gap-1.5" title="Refresh tools" aria-label="Refresh tools" aria-busy="false"><svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-refresh-cw" aria-hidden="true"><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"></path><path d="M21 3v5h-5"></path><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"></path><path d="M8 16H3v5"></path></svg><span>Refresh</span></button><button data-ai-action="true" class="btn">+ Add</button></div>';

const FROZEN_AI_MCP_SERVER_ROW =
  '<div class="flex items-center gap-2 mb-2" role="toolbar" aria-label="MCP server actions: New Server" title="Use arrow keys to review AI actions"><input class="input-num flex-1" aria-label="Server name" spellcheck="false" autocomplete="off" value="New Server"><input class="input-num flex-[2]" aria-label="Server URL" spellcheck="false" autocomplete="off" type="url" value="http://localhost:8080"><select class="input-num w-20" aria-label="Transport"><option value="http">HTTP</option><option value="sse">SSE</option></select><button data-ai-action="true" class="btn inline-flex items-center gap-1" aria-busy="false">Test</button><button data-ai-action="true" class="p-1.5 rounded text-muted hover:text-danger hover:bg-panel2 transition-colors" aria-label="Remove server" title="Remove server"><svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-trash2 lucide-trash-2" aria-hidden="true"><path d="M10 11v6"></path><path d="M14 11v6"></path><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"></path><path d="M3 6h18"></path><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg></button></div>';

const FROZEN_AI_MCP_SETTINGS_FOOTER =
  '<div class="flex justify-end gap-2 mt-3" role="toolbar" aria-label="MCP settings actions" title="Use arrow keys to review AI actions"><button type="button" data-ai-action="true" class="btn">Cancel</button><button type="button" data-ai-action="true" class="btn-primary">Save</button></div>';

// ---- DebugPanel — frozen DOM ------------------------------------------------------

describe('DebugPanel migration — frozen DOM (zero deltas)', () => {
  it('full initial panel serializes byte-identically (empty log, log tab)', () => {
    expect(mountDebug().outerHTML).toBe(FROZEN_DEBUG_PANEL);
  });

  it('action toolbar serializes byte-identically (kit-owned container + live region)', () => {
    const panel = mountDebug();
    expect(panel.querySelector('[aria-describedby="debug-action-review-status"]')!.outerHTML).toBe(FROZEN_DEBUG_TOOLBAR);
  });
});

// ---- DebugPanel — behavior snapshots ----------------------------------------------

describe('DebugPanel actions — wrap roving with focusedAction announcements', () => {
  it('ArrowRight steps copy → download and announces synchronously', () => {
    const panel = mountDebug();
    const toolbar = panel.querySelector<HTMLElement>('[aria-describedby="debug-action-review-status"]')!;
    // Toolbar order: [simulate, errorLog, copy, download, clear, close].
    const [, , copy, download] = Array.from(toolbar.querySelectorAll<HTMLButtonElement>('[data-debug-action]'));
    expect(reviewText('debug-action-review-status')).toBe('Reviewing Copy diagnostics');
    act(() => copy.focus());
    expect(reviewText('debug-action-review-status')).toBe('Reviewing Copy diagnostics');
    const event = press(copy, 'ArrowRight');
    expect(event.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(download);
    expect(reviewText('debug-action-review-status')).toBe('Reviewing Download diagnostics');
  });

  it('ArrowLeft from simulate wraps to close; all six actions stay enabled', () => {
    const panel = mountDebug();
    const toolbar = panel.querySelector<HTMLElement>('[aria-describedby="debug-action-review-status"]')!;
    const [simulate, , , , , close] = Array.from(toolbar.querySelectorAll<HTMLButtonElement>('[data-debug-action]'));
    expect(Array.from(toolbar.querySelectorAll<HTMLButtonElement>('[data-debug-action]')).every(b => !b.disabled)).toBe(true);
    act(() => simulate.focus());
    press(simulate, 'ArrowLeft');
    expect(document.activeElement).toBe(close);
    expect(reviewText('debug-action-review-status')).toBe('Reviewing Close');
  });

  it('Home/End jump to the absolute ends (clear → simulate / close)', () => {
    const panel = mountDebug();
    const toolbar = panel.querySelector<HTMLElement>('[aria-describedby="debug-action-review-status"]')!;
    const [simulate, , , , clear, close] = Array.from(toolbar.querySelectorAll<HTMLButtonElement>('[data-debug-action]'));
    act(() => clear.focus());
    press(clear, 'Home');
    expect(document.activeElement).toBe(simulate);
    expect(reviewText('debug-action-review-status')).toBe('Reviewing Simulate error');
    act(() => clear.focus());
    press(clear, 'End');
    expect(document.activeElement).toBe(close);
    expect(reviewText('debug-action-review-status')).toBe('Reviewing Close');
  });

  it('ignores non-roving keys without preventing default (ArrowDown)', () => {
    const panel = mountDebug();
    const toolbar = panel.querySelector<HTMLElement>('[aria-describedby="debug-action-review-status"]')!;
    const [, , copy] = Array.from(toolbar.querySelectorAll<HTMLButtonElement>('[data-debug-action]'));
    act(() => copy.focus());
    const event = press(copy, 'ArrowDown');
    expect(event.defaultPrevented).toBe(false);
    expect(document.activeElement).toBe(copy);
  });

  it('plain focus re-publishes the announcement (onFocus semantics preserved)', () => {
    const panel = mountDebug();
    const toolbar = panel.querySelector<HTMLElement>('[aria-describedby="debug-action-review-status"]')!;
    act(() => toolbar.querySelector<HTMLButtonElement>('[data-debug-action="clear"]')!.focus());
    expect(reviewText('debug-action-review-status')).toBe('Reviewing Clear log');
  });
});

// ---- AIPanel — frozen DOM ---------------------------------------------------------

describe('AIPanel migration — frozen DOM (zero deltas)', () => {
  it('full initial panel serializes byte-identically (config present, no modals)', () => {
    expect(mountAI().outerHTML).toBe(FROZEN_AI_PANEL);
  });

  it('header / quick / context / prompt toolbars serialize byte-identically', () => {
    const panel = mountAI();
    expect(regionByLabel(panel, 'AI panel actions').outerHTML).toBe(FROZEN_AI_HEADER);
    expect(regionByLabel(panel, 'AI quick actions').outerHTML).toBe(FROZEN_AI_QUICK);
    expect(regionByLabel(panel, 'AI context actions').outerHTML).toBe(FROZEN_AI_CONTEXT);
    expect(regionByLabel(panel, 'AI prompt actions').outerHTML).toBe(FROZEN_AI_PROMPT);
  });

  it('config modal footer serializes byte-identically (opened via Settings)', () => {
    const panel = mountAI();
    act(() => panel.querySelector<HTMLButtonElement>('[aria-label="AI Configuration"]')!.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    expect(regionByLabel(panel, 'AI settings actions').outerHTML).toBe(FROZEN_AI_CFG_FOOTER);
  });

  it('MCP discovery row, first server row, and settings footer serialize byte-identically', () => {
    const { panel, row } = mountAIWithServerRow();
    expect(regionByLabel(panel, 'MCP discovery actions').outerHTML).toBe(FROZEN_AI_MCP_DISCOVERY);
    expect(row.outerHTML).toBe(FROZEN_AI_MCP_SERVER_ROW);
    expect(regionByLabel(panel, 'MCP settings actions').outerHTML).toBe(FROZEN_AI_MCP_SETTINGS_FOOTER);
  });

  it('no review live region anywhere — the eight toolbars announce nothing', () => {
    expect(mountAI().querySelectorAll('[aria-live]').length).toBe(0);
  });
});

// ---- AIPanel — behavior snapshots -------------------------------------------------

describe('AIPanel [data-ai-action] — wrap roving, no announcements', () => {
  it('header ArrowRight walks mcp → settings → close and wraps back to mcp', () => {
    const panel = mountAI();
    const header = regionByLabel(panel, 'AI panel actions');
    const [mcp, settings, close] = Array.from(header.querySelectorAll<HTMLButtonElement>('[data-ai-action]'));
    act(() => mcp.focus());
    const event = press(mcp, 'ArrowRight');
    expect(event.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(settings);
    press(settings, 'ArrowRight');
    expect(document.activeElement).toBe(close);
    press(close, 'ArrowRight');
    expect(document.activeElement).toBe(mcp);
  });

  it('header ArrowLeft from mcp wraps to close; Home/End hit the ends', () => {
    const panel = mountAI();
    const header = regionByLabel(panel, 'AI panel actions');
    const [mcp, , close] = Array.from(header.querySelectorAll<HTMLButtonElement>('[data-ai-action]'));
    act(() => mcp.focus());
    press(mcp, 'ArrowLeft');
    expect(document.activeElement).toBe(close);
    act(() => mcp.focus());
    press(mcp, 'Home');
    expect(document.activeElement).toBe(mcp);
    act(() => mcp.focus());
    press(mcp, 'End');
    expect(document.activeElement).toBe(close);
  });

  it('ignores non-roving keys without preventing default (ArrowDown)', () => {
    const panel = mountAI();
    const header = regionByLabel(panel, 'AI panel actions');
    const [mcp] = Array.from(header.querySelectorAll<HTMLButtonElement>('[data-ai-action]'));
    act(() => mcp.focus());
    expect(press(mcp, 'ArrowDown').defaultPrevented).toBe(false);
    expect(document.activeElement).toBe(mcp);
  });

  it('arrows typed in the prompt textarea keep their native meaning (interactive-target guard)', () => {
    const panel = mountAI();
    const textarea = panel.querySelector<HTMLTextAreaElement>('textarea[aria-label="Describe an edit or design…"]')!;
    act(() => textarea.focus());
    const event = press(textarea, 'ArrowLeft');
    expect(event.defaultPrevented).toBe(false);
    expect(document.activeElement).toBe(textarea);
  });

  it('arrows typed in an MCP server input keep their native meaning', () => {
    const { row } = mountAIWithServerRow();
    const name = row.querySelector<HTMLInputElement>('input[aria-label="Server name"]')!;
    act(() => name.focus());
    expect(press(name, 'ArrowRight').defaultPrevented).toBe(false);
    expect(document.activeElement).toBe(name);
  });

  it('quick actions ArrowRight steps critique → palette (all enabled while idle)', () => {
    const panel = mountAI();
    const quick = regionByLabel(panel, 'AI quick actions');
    const [critique, palette] = Array.from(quick.querySelectorAll<HTMLButtonElement>('[data-ai-action]'));
    expect(critique.disabled).toBe(false);
    act(() => critique.focus());
    press(critique, 'ArrowRight');
    expect(document.activeElement).toBe(palette);
  });

  it('context actions ArrowRight steps Vision → SVG', () => {
    const panel = mountAI();
    const ctx = regionByLabel(panel, 'AI context actions');
    const [vision, svg] = Array.from(ctx.querySelectorAll<HTMLButtonElement>('[data-ai-action]'));
    act(() => vision.focus());
    press(vision, 'ArrowRight');
    expect(document.activeElement).toBe(svg);
  });

  it('skipDisabled: a pending probe disables Test and roving stays on Remove', () => {
    const { row } = mountAIWithServerRow();
    const [test, remove] = Array.from(row.querySelectorAll<HTMLButtonElement>('[data-ai-action]'));
    expect(test.disabled).toBe(false);
    act(() => test.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    expect(test.disabled).toBe(true); // probeMCPServer mocked pending
    act(() => remove.focus());
    press(remove, 'ArrowRight'); // filtered set is [remove] only → wraps to itself
    expect(document.activeElement).toBe(remove);
  });

  it('INTENDED DELTA — synthetic keydown on the prompt toolbar with every action disabled', () => {
    const panel = mountAI();
    const prompt = regionByLabel(panel, 'AI prompt actions');
    const send = prompt.querySelector<HTMLButtonElement>('[data-ai-action]')!;
    expect(send.disabled).toBe(true); // busy || !input.trim() at mount
    // LEGACY: returned before preventDefault when the filtered set is empty.
    // The kit preventDefaults first and then bails via guardEmpty. Reachable
    // only synthetically: the disabled send cannot hold focus and the
    // container itself is not focusable, so no real user path observes it.
    expect(press(prompt, 'ArrowRight').defaultPrevented).toBe(true);
  });
});
