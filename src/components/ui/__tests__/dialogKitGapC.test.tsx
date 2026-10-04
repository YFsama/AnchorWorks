import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { ReactElement, KeyboardEvent as ReactKeyboardEvent } from 'react';
import { ActionToolbar, type ActionToolbarStatus } from '../ActionToolbar';

/**
 * Gap C extension suite for ActionToolbar: external status regions and
 * composite review text.
 *
 * The pilot (dialogKitEquivalence) and batch-A suites pin the frozen
 * "region as first child" shape. This file pins the two shapes that shape
 * cannot express, both taken from real dialogs:
 *
 * - TemplatesDialog's template grid renders its live region OUTSIDE the
 *   container (a preceding sibling with id=template-grid-review-status)
 *   because the container is a grid whose children must stay cells.
 * - The grid's announcement is index-derived composite text
 *   (`Reviewing <name> <i+1> / <n>. <follow-up>`) rather than the static
 *   per-button data-review strings the kit builds announcements from.
 *
 * Bars: without the new props the DOM must stay byte-identical; with them,
 * the built-in region must disappear / the announcement must be overridable.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const t = (s: string) => s;
const onKeys = (_event: ReactKeyboardEvent<HTMLDivElement>) => undefined;

let host: HTMLDivElement;
let roots: Root[];

function renderElement(element: ReactElement): Element {
  const container = document.createElement('div');
  host.appendChild(container);
  const root = createRoot(container);
  roots.push(root);
  act(() => root.render(element));
  const first = container.firstElementChild;
  expect(first, `rendered nothing for ${String(element.type)}`).toBeTruthy();
  return first!;
}

// ---- (a) no new props: byte-identical to the frozen shape -----------------------

function LegacyToolbar(props: { reviewed: string }) {
  return (
    <div
      className="flex gap-1"
      role="toolbar"
      aria-label={t('Plot actions')}
      aria-describedby="gap-c-status"
      title={t('Use arrow keys to review actions')}
      onKeyDown={onKeys}
    >
      <div id="gap-c-status" className="sr-only" aria-live="polite">
        {`${t('Reviewing')} ${props.reviewed || t('Plot actions')}`}
      </div>
      <button type="button">Plot</button>
    </div>
  );
}

function KitToolbar(props: { reviewed: string }) {
  return (
    <ActionToolbar
      statusId="gap-c-status"
      className="flex gap-1"
      label={t('Plot actions')}
      title={t('Use arrow keys to review actions')}
      onKeyDown={onKeys}
      reviewingLabel={t('Reviewing')}
      reviewed={props.reviewed}
      fallback={t('Plot actions')}
    >
      <button type="button">Plot</button>
    </ActionToolbar>
  );
}

function LegacySpanToolbar(props: { reviewed: string }) {
  return (
    <div
      role="group"
      aria-label={t('Layout actions')}
      aria-describedby="gap-c-span-status"
      onKeyDown={onKeys}
    >
      <span id="gap-c-span-status" className="sr-only" aria-live="polite">
        {`${t('Reviewing')} ${props.reviewed || t('Layout actions')}`}
      </span>
      <button type="button">Auto gap</button>
    </div>
  );
}

function KitSpanToolbar(props: { reviewed: string }) {
  return (
    <ActionToolbar
      statusId="gap-c-span-status"
      role="group"
      label={t('Layout actions')}
      onKeyDown={onKeys}
      reviewingLabel={t('Reviewing')}
      reviewed={props.reviewed}
      fallback={t('Layout actions')}
      statusAs="span"
    >
      <button type="button">Auto gap</button>
    </ActionToolbar>
  );
}

// ---- (b) externalStatus: consumer-rendered region -------------------------------

function ExternalStatusGrid(props: { reviewed: string }) {
  return (
    <>
      <div id="gap-c-external-status" className="sr-only" aria-live="polite">
        {`${t('Reviewing')} ${props.reviewed || t('Template results')}`}
      </div>
      <ActionToolbar
        statusId="gap-c-external-status"
        label={t('Template results')}
        externalStatus
        reviewingLabel={t('Reviewing')}
        reviewed={props.reviewed}
        fallback={t('Template results')}
        onKeyDown={onKeys}
      >
        <button type="button">A4 Poster</button>
      </ActionToolbar>
    </>
  );
}

// ---- (c) statusContent: index-derived composite announcement --------------------

const TEMPLATES = [{ name: 'A4 Poster' }, { name: 'Yard sign' }, { name: 'Banner' }];

function templateAnnouncement(index: number) {
  return ({ reviewingLabel, fallback }: ActionToolbarStatus) =>
    TEMPLATES[index]
      ? `${reviewingLabel} ${t(TEMPLATES[index].name)} ${index + 1} / ${TEMPLATES.length}. ${t('Press Enter to use template')}`
      : fallback;
}

function CompositeGridToolbar(props: { index: number; reviewed: string }) {
  return (
    <ActionToolbar
      statusId="gap-c-composite-status"
      label={t('Template results')}
      reviewingLabel={t('Reviewing')}
      reviewed={props.reviewed}
      fallback={t('No templates found.')}
      onKeyDown={onKeys}
      statusContent={templateAnnouncement(props.index)}
    >
      <button type="button">A4 Poster</button>
    </ActionToolbar>
  );
}

// ---- the suite ----------------------------------------------------------------

describe('ActionToolbar gap C — external status region and composite review text', () => {
  beforeEach(() => {
    host = document.createElement('div');
    document.body.appendChild(host);
    roots = [];
  });

  afterEach(() => {
    for (const root of roots) act(() => root.unmount());
    host.remove();
  });

  it('without the new props, renders the frozen shape byte-identically (toolbar/div)', () => {
    const legacy = renderElement(<LegacyToolbar reviewed="" />);
    const kit = renderElement(<KitToolbar reviewed="" />);
    expect(kit.outerHTML).toBe(legacy.outerHTML);
    expect(kit.outerHTML).toBe(
      '<div class="flex gap-1" role="toolbar" aria-label="Plot actions" aria-describedby="gap-c-status" title="Use arrow keys to review actions">' +
        '<div id="gap-c-status" class="sr-only" aria-live="polite">Reviewing Plot actions</div>' +
        '<button type="button">Plot</button>' +
        '</div>',
    );
  });

  it('without the new props, renders the frozen shape byte-identically (group/span, reviewed set)', () => {
    const legacy = renderElement(<LegacySpanToolbar reviewed="Auto gap" />);
    const kit = renderElement(<KitSpanToolbar reviewed="Auto gap" />);
    expect(kit.outerHTML).toBe(legacy.outerHTML);
    expect(kit.outerHTML).toBe(
      '<div role="group" aria-label="Layout actions" aria-describedby="gap-c-span-status">' +
        '<span id="gap-c-span-status" class="sr-only" aria-live="polite">Reviewing Auto gap</span>' +
        '<button type="button">Auto gap</button>' +
        '</div>',
    );
  });

  it('externalStatus omits the built-in region and describes the consumer-rendered one', () => {
    const root = renderElement(<ExternalStatusGrid reviewed="Yard sign" />);
    expect(root.tagName).toBe('DIV');
    expect(root.id).toBe('gap-c-external-status');
    const toolbar = root.nextElementSibling!;
    expect(toolbar.getAttribute('role')).toBe('toolbar');
    // No built-in region inside the container; children render as-is.
    expect(toolbar.querySelector('[aria-live]')).toBeNull();
    expect(toolbar.querySelector('#gap-c-external-status')).toBeNull();
    expect(toolbar.firstElementChild!.tagName).toBe('BUTTON');
    // The describedby target resolves to the external sibling, not to anything inside.
    expect(toolbar.getAttribute('aria-describedby')).toBe('gap-c-external-status');
    const external = document.getElementById('gap-c-external-status');
    expect(external).toBe(root);
    expect(external!.getAttribute('aria-live')).toBe('polite');
    expect(toolbar.contains(external)).toBe(false);
    expect(external!.textContent).toBe('Reviewing Yard sign');
  });

  it('externalStatus wins over statusContent: no region is rendered at all', () => {
    const toolbar = renderElement(
      <ActionToolbar
        statusId="gap-c-precedence-status"
        label={t('Layout actions')}
        externalStatus
        reviewingLabel={t('Reviewing')}
        fallback={t('Layout actions')}
        onKeyDown={onKeys}
        statusContent={() => 'should never render'}
      >
        <button type="button">Auto gap</button>
      </ActionToolbar>,
    );
    expect(toolbar.querySelector('[aria-live]')).toBeNull();
    expect(toolbar.textContent).toBe('Auto gap');
    expect(toolbar.getAttribute('aria-describedby')).toBe('gap-c-precedence-status');
  });

  it('statusContent renders the composite index-derived announcement (TemplatesDialog grid text)', () => {
    const toolbar = renderElement(<CompositeGridToolbar index={0} reviewed="" />);
    const region = toolbar.querySelector('#gap-c-composite-status')!;
    expect(region).toBeTruthy();
    expect(region.outerHTML).toBe(
      '<div id="gap-c-composite-status" class="sr-only" aria-live="polite">' +
        'Reviewing A4 Poster 1 / 3. Press Enter to use template' +
        '</div>',
    );
  });

  it('statusContent follows state changes and falls back through ctx.fallback', () => {
    const container = document.createElement('div');
    host.appendChild(container);
    const root = createRoot(container);
    roots.push(root);
    act(() => root.render(<CompositeGridToolbar index={2} reviewed="Banner" />));
    let region = container.querySelector('#gap-c-composite-status')!;
    expect(region.textContent).toBe('Reviewing Banner 3 / 3. Press Enter to use template');
    act(() => root.render(<CompositeGridToolbar index={9} reviewed="" />));
    region = container.querySelector('#gap-c-composite-status')!;
    expect(region.textContent).toBe('No templates found.');
  });

  it('statusContent receives exactly the default announcement inputs and may return rich nodes', () => {
    const seen: ActionToolbarStatus[] = [];
    const toolbar = renderElement(
      <ActionToolbar
        statusId="gap-c-ctx-status"
        label={t('Plot actions')}
        reviewingLabel={t('Reviewing')}
        reviewed={t('Print')}
        fallback={t('Plot actions')}
        onKeyDown={onKeys}
        statusContent={(status) => {
          seen.push(status);
          return (
            <>
              {status.reviewingLabel} <strong>{status.reviewed || status.fallback}</strong> · 2 / 5
            </>
          );
        }}
      >
        <button type="button">Print</button>
      </ActionToolbar>,
    );
    expect(seen).toEqual([{ reviewingLabel: 'Reviewing', reviewed: 'Print', fallback: 'Plot actions' }]);
    const region = toolbar.querySelector('#gap-c-ctx-status')!;
    expect(region.getAttribute('aria-live')).toBe('polite');
    expect(region.innerHTML).toBe('Reviewing <strong>Print</strong> · 2 / 5');
  });

  it("role='radiogroup' is accepted and passed through to the container", () => {
    const toolbar = renderElement(
      <ActionToolbar
        statusId="gap-c-radio-status"
        role="radiogroup"
        label={t('Binding type')}
        reviewingLabel={t('Reviewing')}
        fallback={t('Binding types')}
        onKeyDown={onKeys}
      >
        <button type="button" role="radio" aria-checked="true">Ring</button>
        <button type="button" role="radio" aria-checked="false">Saddle</button>
      </ActionToolbar>,
    );
    expect(toolbar.getAttribute('role')).toBe('radiogroup');
    expect(toolbar.getAttribute('aria-label')).toBe('Binding type');
    expect(toolbar.getAttribute('aria-describedby')).toBe('gap-c-radio-status');
    expect(toolbar.querySelectorAll('[role="radio"]')).toHaveLength(2);
    // Default role is still 'toolbar' when unspecified.
    const plain = renderElement(
      <ActionToolbar
        statusId="gap-c-default-role-status"
        label={t('Actions')}
        reviewingLabel={t('Reviewing')}
        fallback={t('Actions')}
        onKeyDown={onKeys}
      >
        <button type="button">OK</button>
      </ActionToolbar>,
    );
    expect(plain.getAttribute('role')).toBe('toolbar');
  });
});
