import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { ReactElement } from 'react';
import { PresetRow } from '../PresetRow';
import { ReviewedFooter, ActionButton } from '../ReviewedFooter';
import { AIPanel } from '../../AIPanel';
import { SymbolsPanel } from '../../SymbolsPanel';
import { discoverMCPTools, probeMCPServer } from '../../../lib/mcp';
import { saveSelectionAsSymbol } from '../../../lib/symbols';
import { toast } from '../../../lib/toast';

/**
 * Tail capabilities for the shared dialog kit (implementer AA), closing the
 * last two gaps that kept two regions handwritten:
 *
 *   1. `aria-busy` passthrough on `PresetItem` (PresetRow) and `FooterAction`
 *      (ReviewedFooter) — the gap-A disabled/aria-label pattern extended to
 *      the in-progress flag; opt-in only, default output unchanged.
 *   2. `ActionButton` — a FooterAction-shaped kit button for hand-rolled
 *      containers whose DOM must not gain ActionToolbar's aria-describedby /
 *      live region. AIPanel's eight containers stay hand-rolled (frozen in
 *      panelMigrateDebugAI); its three async aria-busy buttons (send / MCP
 *      Test / Refresh) render through the kit with byte-identical output in
 *      every state: first-render attribute order matches the HEAD JSX order
 *      (pinned by the frozen strings), and busy false→true flips append the
 *      disabled attribute at the end — the exact serialization the HEAD
 *      buttons produced on the same transitions (DOM attribute order only
 *      follows markup order at first render).
 *   3. `makeRovingKeys({ fallbackIndex: -1 })` — the SymbolsPanel naming
 *      toolbar's legacy entry point: arrow keys bubbling from the
 *      auto-focused name <input> land ArrowRight → Save (first) and
 *      ArrowLeft → Cancel (last). The handwritten handler is gone; the
 *      frozen keyboard snapshots in panelMigrateAssetsSymbols (22) and
 *      panelMigrateDebugAI (21) must stay green untouched.
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
vi.mock('../../../lib/symbols', () => ({
  getSymbols: vi.fn(() => []),
  saveSelectionAsSymbol: vi.fn(async () => null),
  insertSymbol: vi.fn(),
  deleteSymbol: vi.fn(),
  renameSymbol: vi.fn(),
  redefineSymbolFromSelection: vi.fn(async () => null),
  detachSymbolInstancesFromSelection: vi.fn(() => 0),
  selectSymbolInstances: vi.fn(() => 0),
}));
vi.mock('../../../lib/toast', () => ({ toast: { success: vi.fn(), warn: vi.fn(), error: vi.fn(), info: vi.fn(), show: vi.fn() } }));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const onKeys = (_event: React.KeyboardEvent<HTMLDivElement>) => undefined;
const setReviewed = (_value: string) => undefined;

let host: HTMLDivElement;
let roots: Root[];

beforeEach(() => {
  host = document.createElement('div');
  document.body.appendChild(host);
  roots = [];
  // jsdom does not implement Element scrolling — AIPanel auto-scrolls on mount.
  Element.prototype.scrollTo = () => {};
});

afterEach(() => {
  for (const root of roots) act(() => root.unmount());
  host.remove();
  delete (Element.prototype as { scrollTo?: unknown }).scrollTo;
});

function renderElement(element: ReactElement): HTMLElement {
  const container = document.createElement('div');
  host.appendChild(container);
  const root = createRoot(container);
  roots.push(root);
  act(() => root.render(element) as unknown as void);
  const first = container.firstElementChild;
  expect(first, `rendered nothing for ${element.type}`).toBeTruthy();
  return first as HTMLElement;
}

const pressSync = (target: Element, key: string): boolean => {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
  act(() => { target.dispatchEvent(event); });
  return event.defaultPrevented;
};

const click = (target: Element): void => {
  act(() => { target.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
};

/** Attribute names in serialization order — pins kit attribute-order decisions. */
const attrNames = (el: Element): string[] => Array.from(el.attributes).map((attr) => attr.name);

// ---- 1. aria-busy passthrough -----------------------------------------------------

describe('dialog kit tail: aria-busy passthrough (gap-A pattern)', () => {
  it('PresetItem renders aria-busy after aria-label, before disabled', () => {
    const toolbar = renderElement(
      <PresetRow
        statusId="tail-preset-status"
        className="grid"
        label="Tail presets"
        onKeyDown={onKeys}
        reviewingLabel="Reviewing"
        fallback="Tail presets"
        actionAttr="data-tail-preset-action"
        setReviewed={setReviewed}
        items={[{
          key: 'trace',
          className: 'btn',
          pressed: true,
          onClick: () => undefined,
          title: 'Trace',
          data: { review: 'Trace review' },
          children: 'Trace',
          'aria-label': 'Run trace',
          'aria-busy': true,
          disabled: true,
        }]}
      />,
    );
    const button = toolbar.querySelector<HTMLButtonElement>('button')!;
    expect(button.outerHTML).toBe(
      '<button type="button" data-tail-preset-action="true" data-review="Trace review" class="btn" aria-pressed="true" title="Trace" aria-label="Run trace" aria-busy="true" disabled="">Trace</button>',
    );
  });

  it('FooterAction renders aria-busy after aria-label, before disabled', () => {
    const toolbar = renderElement(
      <ReviewedFooter
        statusId="tail-footer-status"
        className="flex justify-end gap-2"
        label="Tail footer actions"
        onKeyDown={onKeys}
        reviewingLabel="Reviewing"
        fallback="Tail footer actions"
        actionAttr="data-tail-action"
        setReviewed={setReviewed}
        actions={[{
          children: 'Refresh',
          review: 'Refresh tools',
          className: 'btn',
          onClick: () => undefined,
          'aria-label': 'Refresh tools',
          'aria-busy': true,
          disabled: true,
        }]}
      />,
    );
    const button = toolbar.querySelector<HTMLButtonElement>('button')!;
    expect(button.outerHTML).toBe(
      '<button type="button" data-tail-action="true" data-tail-action-review="Refresh tools" class="btn" aria-label="Refresh tools" aria-busy="true" disabled="">Refresh</button>',
    );
  });

  it('omitting the prop leaves no attribute — the default output is unchanged', () => {
    const preset = renderElement(
      <PresetRow
        statusId="tail-preset-status"
        className="grid"
        label="Tail presets"
        onKeyDown={onKeys}
        reviewingLabel="Reviewing"
        fallback="Tail presets"
        actionAttr="data-tail-preset-action"
        setReviewed={setReviewed}
        items={[{ key: 'a', className: 'btn', onClick: () => undefined, data: { review: 'A' }, children: 'A' }]}
      />,
    );
    expect(preset.querySelector('button')!.hasAttribute('aria-busy')).toBe(false);

    const footer = renderElement(
      <ReviewedFooter
        statusId="tail-footer-status"
        className="flex"
        label="Tail footer actions"
        onKeyDown={onKeys}
        reviewingLabel="Reviewing"
        fallback="Tail footer actions"
        actionAttr="data-tail-action"
        setReviewed={setReviewed}
        actions={[{ children: 'Cancel', review: 'Cancel', className: 'btn', onClick: () => undefined }]}
      />,
    );
    expect(footer.querySelector('button')!.hasAttribute('aria-busy')).toBe(false);
  });
});

// ---- 2. ActionButton byte forms ----------------------------------------------------

describe('dialog kit tail: ActionButton (kit button for hand-rolled containers)', () => {
  it('renders the AIPanel send-button byte form (disabled present)', () => {
    const button = renderElement(
      <ActionButton actionAttr="data-ai-action" className="btn-primary" onClick={() => undefined} disabled title="Send message" aria-label="Send message" aria-busy={false}>
        Send
      </ActionButton>,
    );
    expect(button.outerHTML).toBe(
      '<button data-ai-action="true" disabled="" class="btn-primary" title="Send message" aria-label="Send message" aria-busy="false">Send</button>',
    );
  });

  it('renders the AIPanel refresh-button byte form (disabled omitted at rest)', () => {
    const button = renderElement(
      <ActionButton actionAttr="data-ai-action" className="btn inline-flex items-center gap-1.5" onClick={() => undefined} disabled={false} title="Refresh tools" aria-label="Refresh tools" aria-busy={false}>
        <span>Refresh</span>
      </ActionButton>,
    );
    expect(button.outerHTML).toBe(
      '<button data-ai-action="true" class="btn inline-flex items-center gap-1.5" title="Refresh tools" aria-label="Refresh tools" aria-busy="false"><span>Refresh</span></button>',
    );
  });

  it('renders the AIPanel test-button byte form (title/aria-label absent)', () => {
    const button = renderElement(
      <ActionButton actionAttr="data-ai-action" className="btn inline-flex items-center gap-1" disabled={false} aria-busy={false}>
        Test
      </ActionButton>,
    );
    expect(button.outerHTML).toBe(
      '<button data-ai-action="true" class="btn inline-flex items-center gap-1" aria-busy="false">Test</button>',
    );
  });

  it('adds no type and no phantom attributes when props are omitted', () => {
    const button = renderElement(<ActionButton className="btn">Plain</ActionButton>);
    expect(button.outerHTML).toBe('<button class="btn">Plain</button>');
    expect(button.getAttribute('type')).toBe(null);
  });
});

// ---- 3. AIPanel recycled buttons (HEAD-byte equivalents) ----------------------------

// Byte captures of the HEAD buttons, re-verified against
// `git show HEAD:src/components/AIPanel.tsx` and identical to the frozen
// toolbar strings in panelMigrateDebugAI.test.tsx.
const FROZEN_PROMPT_TOOLBAR =
  '<div class="border-t border-border p-2 flex items-end gap-2" role="toolbar" aria-label="AI prompt actions" title="Use arrow keys to review AI actions"><textarea rows="2" placeholder="Describe an edit or design…" aria-label="Describe an edit or design…" class="flex-1 bg-panel2 border border-border rounded p-2 text-xs outline-none focus:border-accent2 resize-none disabled:opacity-50 disabled:cursor-not-allowed transition-colors"></textarea><button data-ai-action="true" disabled="" class="btn-primary" title="Send message" aria-label="Send message" aria-busy="false"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-send" aria-hidden="true"><path d="M14.536 21.686a.5.5 0 0 0 .937-.024l6.5-19a.496.496 0 0 0-.635-.635l-19 6.5a.5.5 0 0 0-.024.937l7.93 3.18a2 2 0 0 1 1.112 1.11z"></path><path d="m21.854 2.147-10.94 10.939"></path></svg></button></div>';

const FROZEN_REFRESH_BUTTON =
  '<button data-ai-action="true" class="btn inline-flex items-center gap-1.5" title="Refresh tools" aria-label="Refresh tools" aria-busy="false"><svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-refresh-cw" aria-hidden="true"><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"></path><path d="M21 3v5h-5"></path><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"></path><path d="M8 16H3v5"></path></svg><span>Refresh</span></button>';

const FROZEN_TEST_BUTTON =
  '<button data-ai-action="true" class="btn inline-flex items-center gap-1" aria-busy="false">Test</button>';

describe('dialog kit tail: AIPanel aria-busy buttons through the kit', () => {
  const mountAI = () => renderElement(<AIPanel onClose={() => {}} />);

  /** Opens the MCP Servers & Skills modal and adds one server row. */
  function mountAIWithServerRow(): { panel: HTMLElement; row: HTMLElement } {
    const panel = mountAI();
    click(panel.querySelector<HTMLButtonElement>('[aria-label="MCP / Skills"]')!);
    const addBtn = Array.from(panel.querySelectorAll<HTMLButtonElement>('button')).find((b) => b.textContent === '+ Add')!;
    click(addBtn);
    return { panel, row: panel.querySelector<HTMLElement>('[aria-label^="MCP server actions"]')! };
  }

  it('the prompt toolbar (kit-rendered send button) serializes byte-identically to HEAD', () => {
    const panel = mountAI();
    expect(panel.querySelector('div[role="toolbar"][aria-label="AI prompt actions"]')!.outerHTML).toBe(FROZEN_PROMPT_TOOLBAR);
  });

  it('the MCP Refresh and Test buttons serialize byte-identically to HEAD at rest', () => {
    const { panel, row } = mountAIWithServerRow();
    const refresh = panel.querySelector<HTMLButtonElement>('[aria-label="Refresh tools"]')!;
    expect(refresh.outerHTML).toBe(FROZEN_REFRESH_BUTTON);
    const [test] = Array.from(row.querySelectorAll<HTMLButtonElement>('[data-ai-action]'));
    expect(test.outerHTML).toBe(FROZEN_TEST_BUTTON);
  });

  it('Test still probes through the kit onClick; the pending probe disables it with aria-busy', async () => {
    vi.mocked(probeMCPServer).mockReturnValue(new Promise(() => {}));
    const { row } = mountAIWithServerRow();
    const [test] = Array.from(row.querySelectorAll<HTMLButtonElement>('[data-ai-action]'));
    click(test);
    expect(probeMCPServer).toHaveBeenCalledTimes(1);
    expect(test.disabled).toBe(true);
    expect(test.getAttribute('aria-busy')).toBe('true');
    expect(test.textContent).toContain('Testing…');
    // The busy transition appends the new disabled attribute at the END of
    // the attribute list — exactly what the HEAD button serialized too (DOM
    // attribute order only follows markup order at first render, and both
    // first renders omit disabled here).
    expect(attrNames(test)).toEqual(['data-ai-action', 'class', 'aria-busy', 'disabled']);
  });

  it('Refresh flips into its busy byte form and returns to the HEAD bytes when done', async () => {
    let resolveDiscovery!: (value: Awaited<ReturnType<typeof discoverMCPTools>>) => void;
    vi.mocked(discoverMCPTools).mockImplementation(() => new Promise((resolve) => { resolveDiscovery = resolve; }));
    const { panel } = mountAIWithServerRow();
    const refresh = panel.querySelector<HTMLButtonElement>('[aria-label="Refresh tools"]')!;
    click(refresh);
    expect(refresh.disabled).toBe(true);
    expect(refresh.getAttribute('aria-busy')).toBe('true');
    expect(refresh.textContent).toContain('Refreshing…');
    // The busy transition appends disabled at the END — the identical bytes
    // the HEAD button produced on the same false→true flip.
    expect(attrNames(refresh)).toEqual(['data-ai-action', 'class', 'title', 'aria-label', 'aria-busy', 'disabled']);
    await act(async () => { resolveDiscovery({ servers: 0, tools: 0, failures: [] }); });
    expect(refresh.outerHTML).toBe(FROZEN_REFRESH_BUTTON);
  });
});

// ---- 4. SymbolsPanel naming toolbar through makeRovingKeys --------------------------

describe('dialog kit tail: SymbolsPanel naming toolbar via fallbackIndex -1', () => {
  const FROZEN_NAMING_TOOLBAR =
    '<div class="flex items-center gap-1" role="toolbar" aria-label="Symbol naming actions" aria-describedby="symbol-action-review-status" title="Use arrow keys to review symbol actions"><span id="symbol-action-review-status" class="sr-only" aria-live="polite">Reviewing Symbol naming actions</span><input class="input-num flex-1" placeholder="Symbol name" aria-label="Symbol name" type="text" value=""><button type="button" data-symbol-naming-action="true" data-symbol-naming-action-review="Save symbol" class="btn p-1" aria-label="Save symbol" title="Save (Enter)"><svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-check" aria-hidden="true"><path d="M20 6 9 17l-5-5"></path></svg></button><button type="button" data-symbol-naming-action="true" data-symbol-naming-action-review="Cancel" class="btn p-1" aria-label="Cancel" title="Cancel (Esc)"><svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-x" aria-hidden="true"><path d="M18 6 6 18"></path><path d="m6 6 12 12"></path></svg></button></div>';

  function openNaming(panel: HTMLElement): HTMLInputElement {
    const saveBtn = Array.from(panel.querySelectorAll('button')).find((b) => b.textContent?.trim() === 'Save Symbol')!;
    click(saveBtn);
    return panel.querySelector<HTMLInputElement>('[aria-describedby="symbol-action-review-status"] input')!;
  }

  const namingButtons = (panel: HTMLElement) =>
    Array.from(panel.querySelectorAll<HTMLButtonElement>('[data-symbol-naming-action]'));

  it('the toolbar DOM is untouched by the handler swap (HEAD bytes)', () => {
    const panel = renderElement(<SymbolsPanel />);
    openNaming(panel);
    expect(panel.querySelector('[aria-describedby="symbol-action-review-status"]')!.outerHTML).toBe(FROZEN_NAMING_TOOLBAR);
  });

  it('ArrowRight bubbling from the auto-focused input lands on Save (first button)', () => {
    const panel = renderElement(<SymbolsPanel />);
    const input = openNaming(panel);
    expect(document.activeElement).toBe(input);
    expect(pressSync(input, 'ArrowRight')).toBe(true);
    expect(document.activeElement).toBe(namingButtons(panel)[0]);
    expect(document.getElementById('symbol-action-review-status')!.textContent).toBe('Reviewing Save symbol');
  });

  it('ArrowLeft bubbling from the input wraps onto Cancel (last button)', () => {
    const panel = renderElement(<SymbolsPanel />);
    const input = openNaming(panel);
    expect(pressSync(input, 'ArrowLeft')).toBe(true);
    expect(document.activeElement).toBe(namingButtons(panel)[1]);
    expect(document.getElementById('symbol-action-review-status')!.textContent).toBe('Reviewing Cancel');
  });

  it('matched-focus roving still wraps: Save ArrowRight → Cancel, Cancel ArrowLeft → Save', () => {
    const panel = renderElement(<SymbolsPanel />);
    openNaming(panel);
    const [save, cancel] = namingButtons(panel);
    act(() => save.focus());
    expect(pressSync(save, 'ArrowRight')).toBe(true);
    expect(document.activeElement).toBe(cancel);
    expect(pressSync(cancel, 'ArrowLeft')).toBe(true);
    expect(document.activeElement).toBe(save);
    expect(pressSync(save, 'Home')).toBe(true);
    expect(document.activeElement).toBe(save);
    expect(pressSync(save, 'End')).toBe(true);
    expect(document.activeElement).toBe(cancel);
  });

  it('non-roving keys keep their native meaning inside the input', () => {
    const panel = renderElement(<SymbolsPanel />);
    const input = openNaming(panel);
    expect(pressSync(input, 'z')).toBe(false);
    expect(pressSync(input, 'ArrowDown')).toBe(false);
    expect(document.activeElement).toBe(input);
  });

  it('Enter on the input still commits through the untouched input handler', () => {
    const panel = renderElement(<SymbolsPanel />);
    const input = openNaming(panel);
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
    act(() => {
      setter.call(input, 'Buoy 2');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(pressSync(input, 'Enter')).toBe(true);
    expect(saveSelectionAsSymbol).toHaveBeenCalledWith('Buoy 2');
    expect(panel.querySelector('[data-symbol-naming-action]')).toBeNull();
    expect(vi.mocked(toast.warn)).not.toHaveBeenCalled();
  });
});
