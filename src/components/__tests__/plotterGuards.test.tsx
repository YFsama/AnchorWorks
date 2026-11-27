import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { PlotterDialog } from '../PlotterDialog';
import { useEditor, type CutPath } from '../../store/editor';
import { getSharedPlotterLink } from '../../lib/plotterLink';
import { download } from '../../lib/io';
import { callNative, isTauri } from '../../lib/runtime';
import { toast } from '../../lib/toast';

/**
 * Connect-on-demand guard + Machine-tab layout for the plotter dialog.
 *
 * The dialog's single link gate (ensureLink, reached through streamJob by
 * every send: job, Test cut, Force / Corner tour, per-layer job) is exercised
 * end to end on the real component — no raw browser exception may reach the
 * operator, the chooser is opened when the shell has Web Serial, the dialog
 * lands on the Machine tab's connection card when nothing got linked, and a
 * chosen port is connected, primed and streamed through without leaving the
 * Output tab. The Machine tab's card layout (connection card first and never
 * collapsed, positioning card only once linked, diagnostics collapsed) and
 * the keyboard-jog / arrow-key truce are covered here too.
 */

vi.mock('../../lib/io', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/io')>();
  return { ...actual, download: vi.fn() };
});
vi.mock('../../lib/runtime', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/runtime')>();
  return { ...actual, isTauri: vi.fn(actual.isTauri), callNative: vi.fn(actual.callNative) };
});
vi.mock('../../lib/toast', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/toast')>();
  return { ...actual, toast: { ...actual.toast, success: vi.fn(), error: vi.fn(), warn: vi.fn(), info: vi.fn() } };
});

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const RAW_BROWSER_TEXT = "Failed to execute 'requestPort' on 'Serial': No port selected by the user.";

let host: HTMLDivElement;
let roots: Root[];
let serialStubbed = false;
let sendStubbed = false;

function mountDialog(): HTMLDivElement {
  const container = document.createElement('div');
  host.appendChild(container);
  const root = createRoot(container);
  roots.push(root);
  act(() => {
    useEditor.setState({ showPlotter: true });
    root.render(<PlotterDialog />);
  });
  return container;
}

function click(el: Element): void {
  act(() => {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  });
}

/** Click and let the async handler run for `ms` of real time inside one act. */
async function clickAsync(el: Element, ms = 20): Promise<void> {
  await act(async () => {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    await new Promise<void>((resolve) => { setTimeout(resolve, ms); });
  });
}

/** Every toast shown so far, as `${kind}: ${title} | ${message}`. */
type ToastCall = [message: string, opts: { title?: string } | undefined];
function toastLog(): string[] {
  const callsOf = (fn: unknown) => (fn as unknown as { mock: { calls: ToastCall[] } }).mock.calls;
  const line = (kind: string, fn: unknown) =>
    callsOf(fn).map(([message, opts]) => `${kind}: ${opts?.title ?? ''} | ${message}`);
  return [...line('success', toast.success), ...line('error', toast.error), ...line('warn', toast.warn), ...line('info', toast.info)];
}

const selectedTab = (c: HTMLElement) =>
  c.querySelector('[role="tablist"][aria-label="Plotter sections"] [role="tab"][aria-selected="true"]')?.getAttribute('id');

const tabIds = (c: HTMLElement) =>
  Array.from(c.querySelectorAll('[role="tablist"][aria-label="Plotter sections"] [role="tab"]')).map((t) => t.getAttribute('id'));

const footerButton = (c: HTMLElement, label: string) =>
  Array.from(c.querySelectorAll<HTMLButtonElement>('[aria-label="Plotter output actions"] button'))
    .find((b) => b.textContent === label)!;

const button = (root: ParentNode, label: string) =>
  Array.from(root.querySelectorAll<HTMLButtonElement>('button')).find((b) => b.textContent === label)!;

const summaryText = (c: HTMLElement) =>
  Array.from(c.querySelectorAll('span')).find((s) => s.textContent?.includes('Ready to output'))?.parentElement?.textContent ?? '';

/** A 100 × 60 mm closed rectangle cut path (CutPath coords are mm). */
function rectPath(id: string, color?: string, passes?: number): CutPath {
  return {
    id,
    points: [[10, 10], [110, 10], [110, 70], [10, 70], [10, 10]],
    closed: true,
    kind: 'outline',
    ...(color ? { color } : {}),
    ...(passes ? { passes } : {}),
  };
}

/** Fake Web Serial port — records every byte the link writes. */
function makeFakePort() {
  const written: number[] = [];
  const readable = new ReadableStream<Uint8Array>();
  const writable = new WritableStream<Uint8Array>({ write(chunk) { written.push(...chunk); } });
  return {
    open: vi.fn(async (_o: unknown) => {}),
    close: vi.fn(async () => {}),
    readable,
    writable,
    written,
    text: () => new TextDecoder().decode(new Uint8Array(written)),
  };
}

function installSerial(serial: unknown): void {
  Object.defineProperty(window.navigator, 'serial', { value: serial, configurable: true });
  serialStubbed = true;
}

/** Park the shared link in "connected" behind a no-op transport spy. */
function linkConnected() {
  const link = getSharedPlotterLink();
  link.status = 'connected';
  const spy = vi.fn<(data: string | Uint8Array) => Promise<void>>().mockResolvedValue(undefined);
  // Own property shadows the prototype method; removed again in afterEach.
  Object.defineProperty(link, 'send', { value: spy, configurable: true, writable: true });
  sendStubbed = true;
  return spy;
}

beforeEach(() => {
  host = document.createElement('div');
  document.body.appendChild(host);
  roots = [];
  window.localStorage.clear();
  useEditor.setState({ cutPaths: [], showPlotter: false });
  serialStubbed = false;
  getSharedPlotterLink().status = 'idle';
  vi.mocked(download).mockReset();
  vi.mocked(toast.success).mockClear();
  vi.mocked(toast.error).mockClear();
  vi.mocked(toast.warn).mockClear();
  vi.mocked(toast.info).mockClear();
});

afterEach(async () => {
  await act(async () => {
    await getSharedPlotterLink().close();
    for (const root of roots) root.unmount();
  });
  host.remove();
  if (sendStubbed) delete (getSharedPlotterLink() as { send?: unknown }).send;
  sendStubbed = false;
  getSharedPlotterLink().status = 'idle';
  if (serialStubbed) delete (window.navigator as { serial?: unknown }).serial;
  vi.mocked(isTauri).mockRestore();
  vi.mocked(callNative).mockRestore();
});

describe('PlotterDialog — Output-first tabs', () => {
  it('lands on the Output tab (nothing connected) with the cut preview, ordered Output / Cut settings / Calibrate & test / Machine', () => {
    useEditor.setState({ cutPaths: [rectPath('r1')] });
    const c = mountDialog();
    expect(selectedTab(c)).toBe('plotter-tab-output');
    expect(tabIds(c)).toEqual(['plotter-tab-output', 'plotter-tab-cut', 'plotter-tab-calibrate', 'plotter-tab-machine']);
    expect(c.querySelector('[data-plotter-pane="output"] svg[aria-label="Cut preview"]')).not.toBeNull();
    // Not connected: the strip on top of the preview says so and offers the way in.
    const strip = c.querySelector('[data-plotter-pane="output"] [data-plotter-link-status]')!;
    expect(strip.getAttribute('data-plotter-link-status')).toBe('none');
    expect(strip.textContent).toContain('Not connected');
    expect(strip.querySelector('#plotter-status-connect')!.textContent).toBe('Connect…');
    // The strip sits above the preview in document order.
    expect(strip.compareDocumentPosition(c.querySelector('svg[aria-label="Cut preview"]')!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // Arrow roaming follows the display order: Output → Cut settings → Calibrate & test → Machine.
    c.querySelector<HTMLElement>('#plotter-tab-output')!.focus();
    act(() => {
      c.querySelector('#plotter-tab-output')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }));
    });
    expect(selectedTab(c)).toBe('plotter-tab-cut');
    act(() => {
      c.querySelector('#plotter-tab-cut')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }));
    });
    expect(selectedTab(c)).toBe('plotter-tab-calibrate');
    act(() => {
      c.querySelector('#plotter-tab-calibrate')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }));
    });
    expect(selectedTab(c)).toBe('plotter-tab-machine');
    act(() => {
      c.querySelector('#plotter-tab-machine')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true, cancelable: true }));
    });
    expect(selectedTab(c)).toBe('plotter-tab-output');
  });

  it('lands on Output even when a link is already up (connected or not, the preview comes first)', () => {
    linkConnected();
    const c = mountDialog();
    expect(selectedTab(c)).toBe('plotter-tab-output');
  });
});

describe('PlotterDialog — connect-on-demand link gate', () => {
  it('web shell, chooser dismissed: readable hint (never the raw browser text), Machine tab focused on the connection card, nothing sent', async () => {
    const requestPort = vi.fn(async () => { throw new DOMException(RAW_BROWSER_TEXT, 'NotFoundError'); });
    installSerial({ getPorts: async () => [], requestPort });
    useEditor.setState({ cutPaths: [rectPath('r1')] });
    const c = mountDialog();
    expect(footerButton(c, 'Send via USB').disabled).toBe(false);

    await clickAsync(footerButton(c, 'Test cut'));

    // The chooser was opened on the operator's behalf (after a guiding toast)…
    expect(requestPort).toHaveBeenCalledTimes(1);
    expect(toastLog()[0]).toContain('serial port');
    // …and the dismissal is explained in plain words — no DOMException text.
    const log = toastLog().join('\n');
    expect(log).toContain('Port selection cancelled');
    expect(log).not.toContain('Failed to execute');
    expect(log).not.toContain('requestPort');
    expect(toast.error).not.toHaveBeenCalled();
    // Sent nothing, downloaded nothing (a direct path exists, so no file fallback).
    expect(vi.mocked(download)).not.toHaveBeenCalled();
    expect(getSharedPlotterLink().status).toBe('idle');
    // Lands on the Machine tab with focus on the connection card's action.
    expect(selectedTab(c)).toBe('plotter-tab-machine');
    await act(async () => { await new Promise<void>((r) => { setTimeout(r, 40); }); });
    expect(c.querySelector('[data-plotter-card="connect"]')).not.toBeNull();
    expect(document.activeElement?.id).toBe('plotter-connect-primary');
  });

  it('Send via USB while unconnected goes through the same gate (dismissed → hint + Machine tab, nothing streamed)', async () => {
    const requestPort = vi.fn(async () => { throw new DOMException(RAW_BROWSER_TEXT, 'NotFoundError'); });
    installSerial({ getPorts: async () => [], requestPort });
    useEditor.setState({ cutPaths: [rectPath('r1')] });
    const c = mountDialog();

    await clickAsync(footerButton(c, 'Send via USB'));

    expect(requestPort).toHaveBeenCalledTimes(1);
    expect(toastLog().join('\n')).not.toContain('Failed to execute');
    expect(toastLog().join('\n')).toContain('Port selection cancelled');
    expect(toast.success).not.toHaveBeenCalled();
    expect(selectedTab(c)).toBe('plotter-tab-machine');
  });

  it('web shell, port chosen: the chooser is opened, the port is opened and primed, and the job streams over the link — still on the Output tab', async () => {
    const port = makeFakePort();
    const requestPort = vi.fn(async () => port);
    installSerial({ getPorts: async () => [], requestPort });
    useEditor.setState({ cutPaths: [rectPath('r1')] });
    const c = mountDialog();

    await clickAsync(footerButton(c, 'Send via USB'), 1400); // the OH; area query waits out its 1 s timeout

    expect(requestPort).toHaveBeenCalledTimes(1);
    expect(port.open).toHaveBeenCalledTimes(1);
    expect(port.open.mock.calls[0][0]).toMatchObject({ baudRate: 115200, dataBits: 8, stopBits: 1 });
    const wire = port.text();
    // Primed like the Connect button (HP-GL area query), then the real job.
    expect(wire).toContain('OH;');
    expect(wire).toMatch(/PU-?\d+,-?\d+;\nPD/);
    expect(wire).not.toContain('NaN'); // no non-finite coordinates reach the machine
    expect(toast.success).toHaveBeenCalledWith(expect.stringContaining('Sent to plotter'));
    expect(toast.error).not.toHaveBeenCalled();
    // Connected now: the strip flipped and the operator was NOT pulled off the preview.
    expect(getSharedPlotterLink().status).toBe('connected');
    expect(selectedTab(c)).toBe('plotter-tab-output');
    expect(c.querySelector('[data-plotter-link-status]')!.getAttribute('data-plotter-link-status')).toBe('connected');
    expect(c.querySelector('[data-plotter-link-status]')!.textContent).toContain('Web Serial @ 115200');
    expect(c.querySelector('#plotter-status-jog')).not.toBeNull();
  });

  it('web shell, the chosen port fails to open: readable failure + Machine tab, no raw text, link left idle', async () => {
    const port = makeFakePort();
    port.open.mockRejectedValue(new DOMException("Failed to execute 'open' on 'SerialPort': The port is already open.", 'InvalidStateError'));
    installSerial({ getPorts: async () => [], requestPort: async () => port });
    useEditor.setState({ cutPaths: [rectPath('r1')] });
    const c = mountDialog();

    await clickAsync(footerButton(c, 'Corner tour'));

    expect(toast.error).toHaveBeenCalledTimes(1);
    expect(toastLog().find((l) => l.startsWith('error: '))?.split(' | ')[0]).toBe('error: Could not open the serial port');
    expect(port.written.length).toBe(0); // nothing reached the wire
    expect(selectedTab(c)).toBe('plotter-tab-machine');
    // The status strip back on Output reports the error rather than "not connected".
    click(c.querySelector('#plotter-tab-output')!);
    expect(c.querySelector('[data-plotter-link-status]')!.textContent).toContain('Connection error');
  });

  it('desktop shell with no serial port: "No serial ports detected" hint, the link is never opened, lands on Machine', async () => {
    vi.mocked(isTauri).mockReturnValue(true);
    vi.mocked(callNative).mockImplementation(async (command, _args, fallback) =>
      (command === 'serial_list_ports' ? [] : await fallback()) as never);
    const openSpy = vi.spyOn(getSharedPlotterLink(), 'open');
    useEditor.setState({ cutPaths: [rectPath('r1')] });
    const c = mountDialog();

    await clickAsync(footerButton(c, 'Force test'));

    expect(openSpy).not.toHaveBeenCalled();
    const log = toastLog().join('\n');
    expect(log).toContain('No serial ports detected');
    expect(log).toContain('Nothing was sent');
    expect(toast.error).not.toHaveBeenCalled();
    expect(selectedTab(c)).toBe('plotter-tab-machine');
    openSpy.mockRestore();
  });

  it('a shell with no serial API at all (per-layer Send): points at Save File instead of throwing', async () => {
    // jsdom has no navigator.serial → canSend is false, like Firefox / Safari.
    useEditor.setState({ cutPaths: [rectPath('red', '#ff0000'), rectPath('blue', '#0000ff')] });
    const c = mountDialog();
    const row = c.querySelector<HTMLElement>('div[data-plotter-layer="#ff0000"]')!;

    await clickAsync(button(row, 'Send'));

    const log = toastLog().join('\n');
    expect(log).toContain('Direct USB sending needs the desktop app or Chrome/Edge over HTTPS / localhost. Use Save File instead.');
    expect(toast.error).not.toHaveBeenCalled();
    expect(selectedTab(c)).toBe('plotter-tab-machine');
  });

  it('already connected: the gate passes at once and streams over the link (no chooser, no tab switch)', async () => {
    const requestPort = vi.fn();
    installSerial({ getPorts: async () => [], requestPort });
    const send = linkConnected();
    useEditor.setState({ cutPaths: [rectPath('r1')] });
    const c = mountDialog();

    await clickAsync(footerButton(c, 'Test cut'));

    expect(requestPort).not.toHaveBeenCalled();
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][0]).toContain('PU');
    expect(selectedTab(c)).toBe('plotter-tab-output');
    expect(toast.info).not.toHaveBeenCalled();
  });
});

describe('PlotterDialog — a rehearsal never hides behind a real machine', () => {
  // With the virtual plotter picked, or Rehearse pressed, nothing may reach a
  // machine that happens to be linked: the real link is let go first. "Already
  // connected" used to win — the Rehearse button did nothing, and the next
  // test cut went to the blade.
  const geometryOnTheRealPort = (send: { mock: { calls: unknown[][] } }) =>
    send.mock.calls.map(([text]) => String(text)).join('').match(/P[UD]-?\d/g) ?? [];

  it('virtual plotter picked while a real machine is linked: Test cut rehearses, and the real port gets no geometry', async () => {
    installSerial({ getPorts: async () => [], requestPort: vi.fn() });
    const send = linkConnected(); // a real machine is linked
    useEditor.setState({ cutPaths: [rectPath('r1')] });
    const c = mountDialog();
    click(c.querySelector('#plotter-tab-machine')!);
    const select = c.querySelector<HTMLSelectElement>('[data-testid="plotter-port-select"]')!;
    const virtual = Array.from(select.options).find((o) => o.textContent?.includes('Virtual plotter'))!;
    select.value = virtual.value;
    act(() => { select.dispatchEvent(new Event('change', { bubbles: true })); });
    click(c.querySelector('#plotter-tab-output')!);

    await clickAsync(footerButton(c, 'Test cut'), 600);

    expect(getSharedPlotterLink().simulated).toBe(true);
    expect(geometryOnTheRealPort(send)).toEqual([]);
    expect(selectedTab(c)).toBe('plotter-tab-output');
  });

  it('the control: with a serial port picked, the same click does go to the linked machine', async () => {
    installSerial({ getPorts: async () => [], requestPort: vi.fn() });
    const send = linkConnected();
    useEditor.setState({ cutPaths: [rectPath('r1')] });
    const c = mountDialog();

    await clickAsync(footerButton(c, 'Test cut'));

    expect(getSharedPlotterLink().simulated).toBe(false);
    expect(geometryOnTheRealPort(send).length).toBeGreaterThan(0);
  });

  it('Rehearse on the Calibrate tab lets the real machine go and shows the rehearsal state', async () => {
    const send = linkConnected();
    useEditor.setState({ cutPaths: [rectPath('r1')] });
    const c = mountDialog();
    click(c.querySelector('#plotter-tab-calibrate')!);
    const rehearse = c.querySelector<HTMLButtonElement>('[data-plotter-cal-action="rehearse"]')!;
    expect(rehearse).not.toBeNull();

    await clickAsync(rehearse, 600);

    expect(getSharedPlotterLink().simulated).toBe(true);
    expect(geometryOnTheRealPort(send)).toEqual([]);
    expect(c.querySelector('[data-plotter-cal-rehearsal]')).not.toBeNull(); // the rehearsal read-out is on screen
  });
});

describe('PlotterDialog — Machine tab layout', () => {
  it('connection card first and uncollapsed (port / baud / flow / connect); positioning card only once linked; diagnostics collapsed', () => {
    const c = mountDialog();
    click(c.querySelector('#plotter-tab-machine')!);
    const pane = c.querySelector('[data-plotter-pane="machine"]')!;
    const cards = Array.from(pane.querySelectorAll('[data-plotter-card]')).map((el) => el.getAttribute('data-plotter-card'));
    expect(cards[0]).toBe('connect');

    const connectCard = pane.querySelector('[data-plotter-card="connect"]')!;
    expect(button(connectCard, 'Choose serial port…')).not.toBeNull(); // web shell: the chooser IS the connect action
    expect(connectCard.querySelector('select[aria-label="Baud rate"]')).not.toBeNull();
    expect(connectCard.querySelector('select[aria-label="Flow control"]')).not.toBeNull();
    expect(connectCard.textContent).toContain('Not connected');

    // Nothing to jog while unlinked; diagnostics exist but start collapsed.
    expect(pane.querySelector('[data-plotter-card="jog"]')).toBeNull();
    const toggle = pane.querySelector<HTMLButtonElement>('#plotter-diagnostics-toggle')!;
    expect(toggle.textContent).toContain('Diagnostics & console');
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(pane.querySelector('#plotter-diagnostics-body')).toBeNull();
    expect(pane.textContent).not.toContain('Debug console');

    // Expanding reveals every former console feature.
    click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    const body = pane.querySelector('#plotter-diagnostics-body')!;
    for (const label of ['Self-test', 'Detect baud', 'Identify machine', 'Download report', 'Save machine', 'Update machine', 'Delete machine']) {
      expect(button(body, label), label).toBeTruthy();
    }
    expect(Array.from(body.querySelectorAll('button')).find((b) => b.textContent?.startsWith('Job history'))).toBeTruthy();
    expect(body.textContent).toContain('Saved machines');
    expect(body.querySelector('select[aria-label="Saved machines"]')).not.toBeNull();
    expect(body.querySelector('input[aria-label="Machine name"]')).not.toBeNull();
    expect(body.querySelector('input[aria-label="Raw command"]')).not.toBeNull();
    expect(body.querySelector('[role="log"][aria-label="Serial traffic"]')).not.toBeNull();
    expect(body.querySelector('[role="toolbar"][aria-label="Quick machine commands"]')).not.toBeNull();

    // Machine setup still follows the cards.
    expect(pane.textContent).toContain('Machine setup');
    expect(pane.querySelector('select[aria-label="Machine profile"]')).not.toBeNull();
    expect(pane.querySelector('div[aria-label="Cutter dialect"]')).not.toBeNull();
  });

  it('connected: the status strip shows the link and "Jog & origin" jumps to the positioning card; every everyday control is there and wired', async () => {
    const send = linkConnected();
    const c = mountDialog();
    const strip = c.querySelector('[data-plotter-link-status]')!;
    // A status-only fake link describes itself as "port @ <baud>".
    expect(strip.textContent).toContain('port @ 115200');

    click(c.querySelector('#plotter-status-jog')!);
    await act(async () => { await new Promise<void>((r) => { setTimeout(r, 40); }); });
    expect(selectedTab(c)).toBe('plotter-tab-machine');
    const card = c.querySelector<HTMLElement>('#plotter-jog-card')!;
    expect(card).not.toBeNull();
    expect(document.activeElement).toBe(card);

    // Step selector + the whole everyday set, uncollapsed.
    expect(button(card, '25mm')).toBeTruthy();
    expect(card.querySelector('button[aria-label="Set origin"]')).not.toBeNull();
    for (const label of ['Home', 'Go', 'Pen up', 'Blade tap', 'Feed 50 mm', 'Eject', 'Test cut', 'Force test', 'Corner tour']) {
      expect(button(card, label), label).toBeTruthy();
    }
    expect(card.querySelector('input[aria-label="Move to coordinates"]')).not.toBeNull();
    for (const name of ['Move up', 'Move down', 'Move left', 'Move right']) {
      expect(card.querySelector(`button[aria-label="${name}"]`), name).not.toBeNull();
    }

    // Wired: each control sends the machine text it promises (HP-GL, mm, 10 mm step).
    const lastSent = () => send.mock.calls[send.mock.calls.length - 1][0] as string;
    const press = (el: Element) => act(() => {
      el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })); // keyboard-style click (detail 0)
    });
    press(card.querySelector('button[aria-label="Move up"]')!);
    expect(lastSent()).toBe('PU;PR0,400;');
    press(card.querySelector('button[aria-label="Move left"]')!);
    expect(lastSent()).toBe('PU;PR-400,0;');
    press(card.querySelector('button[aria-label="Move down"]')!);
    expect(lastSent()).toBe('PU;PR0,-400;');
    press(card.querySelector('button[aria-label="Move right"]')!);
    expect(lastSent()).toBe('PU;PR400,0;');
    click(button(card, '25mm'));
    press(card.querySelector('button[aria-label="Move up"]')!);
    expect(lastSent()).toBe('PU;PR0,1000;'); // 25 mm × 40 plotter units
    press(card.querySelector('button[aria-label="Set origin"]')!);
    expect(lastSent()).toBe('IP;');
    press(button(card, 'Home'));
    expect(lastSent()).toBe('PU0,0;');
    press(button(card, 'Pen up'));
    expect(lastSent()).toBe('PU;');
    press(button(card, 'Blade tap'));
    expect(lastSent()).toBe('PD;PU;');
    press(button(card, 'Feed 50 mm'));
    expect(lastSent()).toBe('PU;PR0,-2000;');
    press(button(card, 'Eject'));
    expect(lastSent()).toBe('!PG;');

    // Move to coordinates needs a valid "X,Y" and then sends an absolute pen-up move.
    expect(button(card, 'Go').disabled).toBe(true);
    const moveTo = card.querySelector<HTMLInputElement>('input[aria-label="Move to coordinates"]')!;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
    act(() => { setter.call(moveTo, '25,10'); moveTo.dispatchEvent(new Event('input', { bubbles: true })); });
    expect(button(card, 'Go').disabled).toBe(false);
    press(button(card, 'Go'));
    expect(lastSent()).toBe('PU1000,400;');

    // The footer's own Test cut is the same action as the card's (both present, both enabled).
    expect(footerButton(c, 'Test cut').disabled).toBe(false);
    expect(button(card, 'Test cut').disabled).toBe(false);
  });

  it('press-and-hold on a jog key repeats the move until released (one move at once, then a steady rhythm)', async () => {
    const send = linkConnected();
    const c = mountDialog();
    click(c.querySelector('#plotter-tab-machine')!);
    await act(async () => { await new Promise<void>((r) => { setTimeout(r, 20); }); });
    const up = c.querySelector<HTMLButtonElement>('#plotter-jog-card button[aria-label="Move up"]')!;
    const pointer = (type: string) => act(() => {
      up.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, button: 0 }));
    });
    vi.useFakeTimers();
    try {
      // Pointer press: the first move goes out immediately…
      pointer('pointerdown');
      expect(send).toHaveBeenCalledTimes(1);
      expect(send.mock.calls[0][0]).toBe('PU;PR0,400;');
      // …nothing more during the hold delay, then one move per repeat tick.
      act(() => { vi.advanceTimersByTime(419); });
      expect(send).toHaveBeenCalledTimes(1);
      // First repeat lands at 420 + 170 = 590 ms after the press.
      act(() => { vi.advanceTimersByTime(171); });
      expect(send).toHaveBeenCalledTimes(2);
      act(() => { vi.advanceTimersByTime(340); });
      expect(send).toHaveBeenCalledTimes(4);
      for (const call of send.mock.calls) expect(call[0]).toBe('PU;PR0,400;');
      // The click that ends a pointer press carries detail ≥ 1 (pointer count)
      // and is swallowed — no double move…
      act(() => { up.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, detail: 1 })); });
      expect(send).toHaveBeenCalledTimes(4);
      // …whereas a keyboard click (Enter / Space, detail 0) is one plain move.
      act(() => { up.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, detail: 0 })); });
      expect(send).toHaveBeenCalledTimes(5);
      expect(send.mock.calls[4][0]).toBe("PU;PR0,400;");
      // Release stops the rhythm for good.
      pointer('pointerup');
      act(() => { vi.advanceTimersByTime(1000); });
      expect(send).toHaveBeenCalledTimes(5);
    } finally {
      pointer('pointercancel');
      vi.useRealTimers();
    }
  });

  it('keyboard jog: arrows move the carriage from a neutral focus, but never steal the keys of the tab strip or a segmented control', async () => {
    const send = linkConnected();
    const c = mountDialog();
    click(c.querySelector('#plotter-tab-machine')!);
    await act(async () => { await new Promise<void>((r) => { setTimeout(r, 20); }); });
    const key = (el: Element, k: string) => act(() => {
      el.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
    });

    // Focus on the positioning card itself → plain arrows jog with the selected step.
    const card = c.querySelector<HTMLElement>('#plotter-jog-card')!;
    key(card, 'ArrowUp');
    expect(send.mock.calls[send.mock.calls.length - 1][0]).toBe('PU;PR0,400;');
    key(card, 'ArrowRight');
    expect(send.mock.calls[send.mock.calls.length - 1][0]).toBe('PU;PR400,0;');

    // Focus resting on a jog key (e.g. after clicking it) → arrows still jog.
    card.querySelector<HTMLButtonElement>('button[aria-label="Move up"]')!.focus();
    key(document.activeElement!, 'ArrowDown');
    expect(send.mock.calls[send.mock.calls.length - 1][0]).toBe('PU;PR0,-400;');

    // Focus on a section tab → the arrow switches tabs (and never jogs).
    const before = send.mock.calls.length;
    c.querySelector<HTMLElement>('#plotter-tab-machine')!.focus();
    key(document.activeElement!, 'ArrowLeft');
    expect(send.mock.calls.length).toBe(before);
    expect(selectedTab(c)).toBe('plotter-tab-calibrate'); // Machine → Calibrate & test (display order)

    // Focus in a segmented control (the format buttons on Machine) → no jog.
    click(c.querySelector('#plotter-tab-machine')!);
    const fmt = c.querySelector<HTMLElement>('div[aria-label="Format"] button[data-value="gcode"]')!;
    fmt.focus();
    key(document.activeElement!, 'ArrowRight');
    expect(send.mock.calls.length).toBe(before);
    expect(selectedTab(c)).toBe('plotter-tab-machine');
  });
});

describe('PlotterDialog — path count summary', () => {
  it('counts multi-pass paths the way the machine will cut them (1 path × 3 passes = 3)', () => {
    useEditor.setState({ cutPaths: [rectPath('mp', undefined, 3)] });
    const c = mountDialog();
    expect(summaryText(c)).toContain('3 paths');
    // The stats strip agrees with the summary.
    expect(c.querySelector('span[title="Estimated job time"]')!.parentElement!.textContent!.endsWith('3')).toBe(true);
  });

  it('a single-pass path still counts once', () => {
    useEditor.setState({ cutPaths: [rectPath('r1')] });
    const c = mountDialog();
    expect(summaryText(c)).toContain('1 paths');
  });
});
