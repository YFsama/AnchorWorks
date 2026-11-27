import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { PlotterJobProgress, PlotterStatusChip } from '../PlotterStatusChip';
import { getSharedPlotterLink } from '../../lib/plotterLink';
import { plotterJobMonitor } from '../../lib/plotterJobMonitor';
import { generateGCode, generateHPGL, defaultPlotterOptions } from '../../lib/plotter';
import { toast } from '../../lib/toast';

/**
 * What the status chip and the dialog's job card say about a job, driven by
 * the real job monitor over a fake Web Serial line:
 *
 *   • Pause / Stop stay on screen for the WHOLE transfer. (A question on the
 *     link used to be taken for "transfer finished"; the buttons vanished a
 *     few milliseconds into every grbl job.)
 *   • Alarm / Door / Hold and the travel alarm read as an ALARM — never as
 *     "cut finished".
 *   • The popover's own position poll keeps quiet while a job's stream is on
 *     the wire (on an HP-GL machine a question spliced into a half-sent
 *     statement corrupts it).
 */

vi.mock('../../lib/toast', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/toast')>();
  return { ...actual, toast: { ...actual.toast, success: vi.fn(), error: vi.fn(), warn: vi.fn(), info: vi.fn() } };
});

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/* ---- fake Web Serial line + machines (same shape as plotterJobMonitor.test.ts) ---- */

interface Machine {
  onChar(ch: string): void;
  attach(reply: (text: string) => void): void;
}

function fakeSerial(machine: Machine): { text(): string } {
  const enc = new TextEncoder();
  const dec = new TextDecoder();
  let push: (b: Uint8Array) => void = () => undefined;
  let open = false;
  let written = '';
  const readable = new ReadableStream<Uint8Array>({ start: (c) => { push = (b) => { c.enqueue(b); }; } });
  const reply = (text: string): void => { setTimeout(() => { if (open) push(enc.encode(text)); }, 0); };
  const port = {
    open: async (): Promise<void> => { open = true; },
    close: async (): Promise<void> => { open = false; },
    readable,
    writable: new WritableStream<Uint8Array>({
      write: async (chunk: Uint8Array): Promise<void> => {
        const text = dec.decode(chunk);
        written += text;
        for (const ch of text) machine.onChar(ch);
      },
    }),
  };
  Object.defineProperty(window.navigator, 'serial', { value: { getPorts: async () => [port], requestPort: async () => port }, configurable: true });
  machine.attach(reply);
  return { text: () => written };
}

/** grbl: `ok` per line; `?` answered with `report` (as written, e.g. 'Alarm', 'Door:2'). */
function grblMachine(report = (state: string): string => `<${state}|MPos:10.000,20.000,5.000|FS:0,0>`): Machine {
  let line = '';
  let reply: (text: string) => void = () => undefined;
  let busyUntil = 0;
  return {
    attach: (r) => { reply = r; },
    onChar: (ch) => {
      if (ch === '?') { reply(`${report(Date.now() < busyUntil ? 'Run' : 'Idle')}\r\n`); return; }
      if (ch === '\n') {
        const bare = line.split(';')[0].trim();
        line = '';
        if (!bare) return;
        if (/^G[0-3](?![0-9])/.test(bare) && /[XYZ]/.test(bare)) busyUntil = Date.now() + 400;
        reply('ok\r\n');
      } else if (ch >= ' ') line += ch;
    },
  };
}

/** HP-GL: answers OA; / OS; / OH;. */
function hpglMachine(): Machine {
  let stmt = '';
  let reply: (text: string) => void = () => undefined;
  return {
    attach: (r) => { reply = r; },
    onChar: (ch) => {
      if (ch === '\r' || ch === '\n') return;
      if (ch !== ';') { stmt += ch; return; }
      const up = stmt.trim().toUpperCase();
      stmt = '';
      if (up.startsWith('OA')) reply('400,800,0\r\n');
      else if (up.startsWith('OS')) reply('0\r\n');
      else if (up.startsWith('OH')) reply('0,0,8000,8000\r\n');
    },
  };
}

/* ---- helpers ------------------------------------------------------------- */

type Poly = { points: Array<[number, number]>; closed: boolean };
function squares(n: number): Poly[] {
  const out: Poly[] = [];
  for (let i = 0; i < n; i++) {
    const x = (i % 10) * 20;
    const y = Math.floor(i / 10) * 20;
    out.push({ closed: true, points: [[x, y], [x + 10, y], [x + 10, y + 10], [x, y + 10], [x, y]] });
  }
  return out;
}
const bytes = (text: string): number => new TextEncoder().encode(text).length;
const GCODE = generateGCode(squares(20), { ...defaultPlotterOptions, originBottomLeft: false }); // ~13 chunks at 38400 baud
const HPGL = generateHPGL(squares(300), { ...defaultPlotterOptions, originBottomLeft: false }); // ~43 chunks

let host: HTMLDivElement;
let roots: Root[];

function mount(node: React.ReactNode): HTMLDivElement {
  const container = document.createElement('div');
  host.appendChild(container);
  const root = createRoot(container);
  roots.push(root);
  act(() => { root.render(node); });
  return container;
}
function click(el: Element): void {
  act(() => { el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })); });
}
/** Let `ms` pass with React seesawing everything the monitor publishes meanwhile. */
async function pass(ms: number): Promise<void> {
  await act(async () => { await new Promise<void>((resolve) => { setTimeout(resolve, ms); }); });
}
const button = (root: ParentNode, label: string): HTMLButtonElement | undefined =>
  Array.from(root.querySelectorAll<HTMLButtonElement>('button')).find((b) => b.textContent === label);
const jobCard = (c: ParentNode): HTMLElement | null => c.querySelector<HTMLElement>('[role="status"][data-plotter-job]');
const jobPhase = (c: ParentNode): string | null | undefined => jobCard(c)?.getAttribute('data-plotter-job');
const monitorButton = (c: ParentNode): HTMLButtonElement => c.querySelector<HTMLButtonElement>('button[aria-label="Plotter monitor"]')!;

describe('PlotterStatusChip — job monitor', () => {
  beforeEach(() => {
    host = document.createElement('div');
    document.body.appendChild(host);
    roots = [];
    window.localStorage.clear();
    vi.mocked(toast.success).mockClear();
    vi.mocked(toast.error).mockClear();
    vi.mocked(toast.warn).mockClear();
    vi.mocked(toast.info).mockClear();
  });

  afterEach(async () => {
    act(() => { for (const r of roots) r.unmount(); });
    plotterJobMonitor.dismiss();
    await getSharedPlotterLink().close().catch(() => undefined);
    host.remove();
    Object.defineProperty(window.navigator, 'serial', { value: undefined, configurable: true });
  });

  it('Pause / Stop stay for the whole transfer — a question on the link is not "transfer finished"', async () => {
    fakeSerial(grblMachine());
    const link = getSharedPlotterLink();
    await link.open({ baud: 38400, flowControl: 'none' });
    const c = mount(<PlotterJobProgress onTogglePause={() => {}} onStop={() => {}} />);
    let sending: Promise<void> = Promise.resolve();
    act(() => {
      const jobId = plotterJobMonitor.start({ total: bytes(GCODE), kind: 'job', format: 'gcode', unit: 'mm', cuts: [] });
      sending = link.send(GCODE, { jobId });
    });

    await pass(350);
    expect(jobPhase(c)).toBe('sending');
    expect(button(c, 'Pause')).toBeTruthy();
    expect(button(c, 'Stop job')).toBeTruthy();
    expect(jobCard(c)!.textContent).toContain('Sending');

    // What the monitor's own position poll does every 1.5 s, done here by hand.
    await act(async () => { await link.query('?'); });
    expect(jobPhase(c)).toBe('sending');
    expect(button(c, 'Pause')).toBeTruthy();
    expect(button(c, 'Stop job')).toBeTruthy();

    await act(async () => { await sending; });
    await pass(120);
    expect(['sent', 'busy']).toContain(jobPhase(c));
    expect(button(c, 'Stop job')).toBeUndefined(); // the transfer is over — and only now
  }, 15000);

  it.each([
    ['Alarm', 'Alarm', 'Machine alarm — job NOT finished'],
    ['Door:2', 'Door:2', 'Machine door open — job stopped, NOT finished'],
    ['Hold:0', 'Hold', 'Machine on hold — job stopped, NOT finished'],
  ] as const)('grbl %s reads as an alarm, never as "cut finished"', async (word, expectedWord, line) => {
    fakeSerial(grblMachine(() => `<${word}|MPos:1.000,2.000,-1.000|FS:0,0>`));
    const link = getSharedPlotterLink();
    await link.open({ baud: 115200, flowControl: 'hardware' });
    const card = mount(<PlotterJobProgress onTogglePause={() => {}} onStop={() => {}} />);
    const chip = mount(<PlotterStatusChip />);
    await act(async () => {
      const jobId = plotterJobMonitor.start({ total: bytes(GCODE), kind: 'job', format: 'gcode', unit: 'mm', cuts: [] });
      await link.send(GCODE, { jobId });
    });
    await pass(300);

    // The dialog footer's job card.
    expect(jobPhase(card)).toBe('alarm');
    expect(jobCard(card)!.textContent).toContain(line);
    expect(jobCard(card)!.textContent).toContain(expectedWord); // the controller's own word
    expect(jobCard(card)!.textContent).not.toContain('Cut complete');
    expect(jobCard(card)!.className).toContain('text-danger');
    expect(button(card, 'Stop job')).toBeUndefined();

    // The status-bar chip and its popover.
    expect(monitorButton(chip).getAttribute('data-plotter-job')).toBe('alarm');
    expect(monitorButton(chip).textContent).toContain('Alarm');
    expect(monitorButton(chip).textContent).not.toContain('Cut complete');
    click(monitorButton(chip));
    expect(chip.textContent).toContain(`${line} · ${expectedWord}`);
    expect(chip.textContent).not.toContain('Cut complete');

    // One error toast naming the alarm — and no "finished" anywhere.
    expect(toast.error).toHaveBeenCalledWith(expect.stringContaining(line), { title: 'Plotter alarm' });
    expect(toast.success).not.toHaveBeenCalledWith(expect.stringContaining('Cut finished'));
  }, 10000);

  it('the popover’s own position poll keeps quiet while a job’s stream is on the wire', async () => {
    const wire = fakeSerial(hpglMachine());
    const link = getSharedPlotterLink();
    await link.open({ baud: 38400, flowControl: 'none' });
    let sending: Promise<void> = Promise.resolve();
    act(() => {
      const jobId = plotterJobMonitor.start({ total: bytes(HPGL), kind: 'job', format: 'hpgl', unit: 'mm', cuts: [] });
      sending = link.send(HPGL, { jobId });
    });
    const chip = mount(<PlotterStatusChip />);
    click(monitorButton(chip)); // open the popover: it starts its OA; read-out

    await pass(1200);
    expect(monitorButton(chip).getAttribute('data-plotter-job')).toBe('sending');
    expect(wire.text()).not.toContain('OA;'); // nothing is spliced into the half-sent statements

    await act(async () => { await sending; });
    await pass(400);
    expect(['sent', 'busy']).toContain(monitorButton(chip).getAttribute('data-plotter-job'));
    expect(wire.text()).toContain('OA;'); // stream over: the read-out resumes
  }, 15000);
});
