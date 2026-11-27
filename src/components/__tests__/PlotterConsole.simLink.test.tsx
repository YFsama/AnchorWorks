import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { PlotterConsole, type PlotterConsoleProps } from '../PlotterConsole';
import { PlotterLink } from '../../lib/plotterLink';
import { resetAutoProbeMemory } from '../../lib/plotterScan';

/**
 * The connection card against the REAL link + virtual plotter: the rehearsal
 * option, the rehearsal badge and read-out, the once-per-connection identify,
 * and the automatic scan — which must never leave the shared link looking
 * connected. `onConnect` here is the dialog's half of the contract (open the
 * virtual plotter, prime it like any machine).
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let roots: Root[];
let links: PlotterLink[];

beforeEach(() => {
  host = document.createElement('div');
  document.body.appendChild(host);
  roots = [];
  links = [];
  window.localStorage.clear();
  resetAutoProbeMemory(); // "this list was already probed" is session state, not a component's
});

afterEach(async () => {
  for (const root of roots) act(() => root.unmount());
  host.remove();
  for (const link of links) await link.close();
  Object.defineProperty(navigator, 'serial', { configurable: true, value: undefined });
});

type Over = Partial<Omit<PlotterConsoleProps, 'link'>>;

function mount(over: Over = {}): { c: HTMLElement; link: PlotterLink; onConnect: ReturnType<typeof vi.fn> } {
  const container = document.createElement('div');
  host.appendChild(container);
  const root = createRoot(container);
  roots.push(root);
  const link = new PlotterLink();
  links.push(link);
  const onConnect = vi.fn(async (): Promise<boolean> => {
    await link.open({ simulate: true, baud: 115200, flowControl: 'hardware', format: 'hpgl', unit: 'mm' });
    if (link.status !== 'connected') return false;
    await link.query('OH;', 1000).catch(() => '');
    return true;
  });
  const props: PlotterConsoleProps = {
    link,
    format: 'hpgl',
    setFormat: vi.fn(),
    unit: 'mm',
    native: false,
    webSerial: false,
    sending: false,
    nativePorts: [],
    selectedPort: '',
    setSelectedPort: vi.fn(),
    refreshPorts: vi.fn(),
    portsLoading: false,
    portsError: '',
    baud: 9600,
    setBaud: vi.fn(),
    flow: 'none',
    setFlow: vi.fn(),
    force: 10,
    speed: 10,
    feedRate: 3000,
    profile: null,
    connectInit: '',
    forceSpeedCommand: '',
    snapshotConfig: vi.fn(),
    applyConfig: vi.fn(),
    jobLogVersion: 0,
    applyProfile: vi.fn(),
    onConnect,
    ...over,
  };
  act(() => { root.render(<PlotterConsole {...props} />); });
  return { c: container, link, onConnect };
}

const card = (c: HTMLElement) => c.querySelector('#plotter-connect-card') as HTMLElement;
const text = (el: Element | null | undefined): string => el?.textContent ?? '';
const primary = (c: HTMLElement) => c.querySelector('#plotter-connect-primary') as HTMLButtonElement;
const portSelect = (c: HTMLElement) => c.querySelector('select[data-testid="plotter-port-select"]') as HTMLSelectElement;
const chip = (c: HTMLElement) => text(c.querySelector('#plotter-connect-card [title^="Live carriage position"]'));
const buttonNamed = (c: HTMLElement, label: string) =>
  Array.from(c.querySelectorAll<HTMLButtonElement>('button')).find((b) => b.getAttribute('aria-label') === label)!;

function select(el: HTMLSelectElement, value: string): void {
  act(() => {
    el.value = value;
    el.dispatchEvent(new Event('change', { bubbles: true }));
  });
}

function click(el: Element): void {
  act(() => {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, detail: 0 }));
  });
}

/** Poll inside act until `ready` holds (real time: the virtual head moves on it). */
async function until(ready: () => boolean, ms = 3000): Promise<boolean> {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (ready()) return true;
    await act(async () => { await new Promise((r) => setTimeout(r, 25)); });
  }
  return ready();
}

describe('PlotterConsole — rehearsal mode (virtual plotter)', () => {
  it('offers the virtual plotter first, even in a shell with no serial at all', () => {
    const { c } = mount({ native: false, webSerial: false });
    const options = Array.from(portSelect(c).options).map((o) => o.textContent);
    expect(options[0]).toBe('Virtual plotter (rehearsal mode)');
    expect(options).toHaveLength(2); // …and nothing else to pick in this shell
    // Nothing selected that can be connected: the action waits.
    expect(primary(c).disabled).toBe(true);
    select(portSelect(c), options[0] && portSelect(c).options[0].value);
    expect(primary(c).disabled).toBe(false);
    expect(primary(c).textContent).toBe('Connect');
    expect(c.querySelector('[data-plotter-card="jog"]')).toBeNull(); // nothing to jog yet
  });

  it('Connect asks for the virtual plotter (onConnect({ simulate: true })) and shows the rehearsal state', async () => {
    const { c, link, onConnect } = mount();
    select(portSelect(c), portSelect(c).options[0].value);
    await act(async () => {
      primary(c).dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      await new Promise((r) => setTimeout(r, 150));
    });
    expect(onConnect).toHaveBeenCalledTimes(1);
    expect(onConnect.mock.calls[0][0]).toEqual({ simulate: true });
    expect(link.simulated).toBe(true);
    expect(link.describe()).toBe('Virtual plotter @ 115200');
    expect(text(card(c))).toContain('Rehearsal mode — nothing is sent to a real device');
    expect(card(c).getAttribute('data-plotter-sim')).toBe('true');
    // The positioning card is there, badged as a rehearsal.
    const jog = c.querySelector('[data-plotter-card="jog"]') as HTMLElement;
    expect(jog).not.toBeNull();
    expect(jog.getAttribute('data-plotter-sim')).toBe('true');
    expect(text(jog.querySelector('[data-testid="plotter-rehearsal-badge"]'))).toBe('Rehearsal mode — nothing is sent to a real device');
    expect(primary(c).textContent).toBe('Disconnect');
    // The rehearsal is never remembered as a real port.
    expect(window.localStorage.getItem('vector.plotter.lastLink')).toBeNull();
  });

  it('a jog moves the read-out; Set origin zeroes it', async () => {
    const { c } = mount();
    select(portSelect(c), portSelect(c).options[0].value);
    await act(async () => {
      primary(c).dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      await new Promise((r) => setTimeout(r, 150));
    });
    // The read-out is live right after connecting — no Auto status needed.
    expect(await until(() => chip(c).includes('X 0.0 · Y 0.0 mm'))).toBe(true);

    click(buttonNamed(c, 'Move right')); // 10 mm step (the default)
    expect(await until(() => chip(c).includes('X 10.0 · Y 0.0 mm'), 4000)).toBe(true);

    click(buttonNamed(c, 'Move up'));
    expect(await until(() => chip(c).includes('X 10.0 · Y 10.0 mm'), 4000)).toBe(true);

    click(buttonNamed(c, 'Set origin'));
    expect(await until(() => chip(c).includes('X 0.0 · Y 0.0 mm'), 4000)).toBe(true);
  });

  it('identifies the machine once per connection — the model lands in the connection card', async () => {
    const { c } = mount();
    select(portSelect(c), portSelect(c).options[0].value);
    await act(async () => {
      primary(c).dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      await new Promise((r) => setTimeout(r, 150));
    });
    expect(await until(() => text(card(c)).includes('SIMULATED-PLOTTER'), 4000)).toBe(true);
    expect(text(c.querySelector('[data-testid="plotter-identify-result"]'))).toContain('Machine:');
    // No brand profile matches the virtual machine — nothing to apply.
    expect(c.querySelector('[data-testid="plotter-apply-profile"]')).toBeNull();
  });

  it('does not identify over a profile the operator already chose', async () => {
    const { c } = mount({ profile: { id: 'china-clone', brand: 'China', label: 'China clone (HP-GL)', models: '', baud: 9600, flowControl: 'none', defaultForce: 0, defaultSpeed: 0 } as never });
    select(portSelect(c), portSelect(c).options[0].value);
    await act(async () => {
      primary(c).dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      await new Promise((r) => setTimeout(r, 600));
    });
    expect(link_sim(c)).toBe(true);
    expect(text(card(c))).not.toContain('SIMULATED-PLOTTER');
  });
});

const link_sim = (c: HTMLElement): boolean => c.querySelector('[data-plotter-card="jog"][data-plotter-sim="true"]') !== null;

describe('PlotterConsole — automatic scan', () => {
  const cloneChip = { path: 'COM3', kind: 'usb' as const, vid: 0x1a86, pid: 0x7523 };
  const mountNative = (nativePorts: Array<{ path: string; kind: 'usb'; vid?: number; pid?: number }>) => {
    const spies = { setSelectedPort: vi.fn(), setBaud: vi.fn(), applyProfile: vi.fn() };
    return { ...mount({ native: true, nativePorts, selectedPort: '', ...spies }), spies };
  };

  it('native, one candidate behind a clone chip: identifies by itself and OFFERS the result — nothing is applied until its Connect is pressed', async () => {
    const { c, link, onConnect, spies } = mountNative([cloneChip]);
    expect(await until(() => card(c).querySelector('[data-testid="plotter-scan-status"]') !== null)).toBe(true);
    // No serial stack in this host: the probe cannot open the port, so the
    // CH340 alone decides — "suspected clone", exactly like Auto-detect.
    expect(await until(() => text(card(c)).includes('suspected clone'), 4000)).toBe(true);
    expect(text(c.querySelector('[data-testid="plotter-scan-status"]'))).toContain('COM3 · 9600');
    // Offered, not imposed: the unattended scan changes nothing by itself —
    // a silent CH340 is a guess, and it must not quietly replace the format,
    // baud or profile the operator set.
    expect(spies.applyProfile).not.toHaveBeenCalled();
    expect(spies.setSelectedPort).not.toHaveBeenCalled();
    expect(spies.setBaud).not.toHaveBeenCalled();
    expect(onConnect).not.toHaveBeenCalled();
    expect(link.status).toBe('idle');
    expect(link.simulated).toBe(false);
    expect(text(card(c))).toContain('Not connected');
    // The Connect beside the detection applies it, and connects once it is applied.
    const scanConnect = c.querySelector<HTMLButtonElement>('[data-testid="plotter-scan-connect"]')!;
    expect(scanConnect).not.toBeNull();
    await act(async () => {
      scanConnect.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      await new Promise((r) => setTimeout(r, 150));
    });
    expect(spies.applyProfile).toHaveBeenCalledWith('china-clone');
    expect(spies.setSelectedPort).toHaveBeenCalledWith('COM3');
    expect(spies.setBaud).toHaveBeenCalledWith(9600);
    expect(onConnect).toHaveBeenCalledTimes(1);
    expect(onConnect.mock.calls[0][0]).toBeUndefined(); // the applied port, not a rehearsal
  });

  it('probes a port list once per session: coming back to the tab does not open the machine again; a new list does', async () => {
    const first = mountNative([cloneChip]);
    expect(await until(() => text(card(first.c)).includes('suspected clone'), 4000)).toBe(true);

    // The next visit of the Machine tab is a fresh mount with the same list.
    const again = mountNative([cloneChip]);
    await act(async () => { await new Promise((r) => setTimeout(r, 400)); });
    expect(text(card(again.c))).not.toContain('suspected clone');
    expect(text(card(again.c))).not.toContain('Identifying');
    expect(text(card(again.c))).toContain('1 possible cutter ports'); // listed, with the manual Scan & identify
    expect(again.c.querySelector('[data-testid="plotter-scan-identify"]')).not.toBeNull();

    // A different list is a new question.
    const changed = mountNative([cloneChip, { path: 'COM4', kind: 'usb' }]);
    expect(await until(() => text(card(changed.c)).includes('Identifying') || text(card(changed.c)).includes('suspected clone'), 3000)).toBe(true);
  });

  it('native, four candidates: listed best-first with a "Scan & identify" button — nothing is probed unattended', async () => {
    const { c, link } = mount({
      native: true,
      nativePorts: ['COM3', 'COM5', 'COM7', 'COM9'].map((path) => ({ path, kind: 'usb' as const })),
    });
    expect(await until(() => text(card(c)).includes('4 possible cutter ports'))).toBe(true);
    expect(text(c.querySelector('[data-testid="plotter-scan-status"]'))).toContain('COM3 · COM5 · COM7 · COM9');
    expect(c.querySelector('[data-testid="plotter-scan-identify"]')).not.toBeNull();
    expect(link.status).toBe('idle');
  });

  it('web shell, one authorized port: says so, Connect needs no chooser, the chooser is never raised', async () => {
    const requestPort = vi.fn();
    let opens = 0;
    Object.defineProperty(navigator, 'serial', {
      configurable: true,
      value: {
        getPorts: async () => [{ getInfo: () => ({}) }],
        requestPort,
      },
    });
    // The probe's private link opens the authorized port directly; make that fail fast.
    const originalOpen = PlotterLink.prototype.open;
    vi.spyOn(PlotterLink.prototype, 'open').mockImplementation(async function (this: PlotterLink, opts) {
      if (!opts.simulate) { opens++; throw new Error('port busy'); }
      return originalOpen.call(this, opts);
    });
    const { c, link } = mount({ webSerial: true });
    expect(await until(() => text(card(c)).includes('Last used serial port'), 3000)).toBe(true);
    expect(await until(() => text(card(c)).includes('No cutter answered on any port'), 4000)).toBe(true);
    expect(opens).toBeGreaterThan(0);
    expect(requestPort).not.toHaveBeenCalled();
    expect(link.status).toBe('idle');
    expect(primary(c).textContent).toBe('Connect');
  });

  it('web shell, nothing authorized yet: stays as quiet as before', async () => {
    Object.defineProperty(navigator, 'serial', {
      configurable: true,
      value: { getPorts: async () => [], requestPort: vi.fn() },
    });
    const { c } = mount({ webSerial: true });
    await act(async () => { await new Promise((r) => setTimeout(r, 120)); });
    expect(text(card(c))).toContain('The browser asks which port to use when you connect.');
    expect(c.querySelector('[data-testid="plotter-scan-status"]')).toBeNull();
    expect(primary(c).textContent).toBe('Choose serial port…');
  });
});
