import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { PlotterDialog } from '../PlotterDialog';
import { useEditor, type CutPath } from '../../store/editor';
import { sendOverSerial } from '../../lib/plotter';
import { download } from '../../lib/io';
import { showConfirm } from '../../lib/confirm';

/**
 * Wiring tests for the plotter dialog's layered-vinyl and weed-check
 * surfaces (the lib behaviour itself is covered by layerJobs.test.ts /
 * weedCheck.test.ts):
 *
 *  - Layers (multi-colour vinyl): the section appears only for ≥2 vinyl
 *    colours, orders rows bottom-first ("1 = bottom"), saves stamped
 *    per-layer files, and "Send all layers" gates each vinyl swap behind
 *    showConfirm — declining stops the sequence.
 *  - Weed check (weeding preflight): manual run, per-material profile
 *    floors, the too-many-paths skip notice, and collapse/expand.
 *  - Estimate accuracy: overcut + blade offset add their real seconds to
 *    the job estimate without changing the displayed path count.
 *
 * Mounting follows the PlotterDialog.armsBlade.test.tsx conventions: real
 * component on a fresh root, store state driven through useEditor.setState,
 * plotter prefs seeded through localStorage.
 */

vi.mock('../../lib/plotter', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/plotter')>();
  return { ...actual, sendOverSerial: vi.fn() };
});
vi.mock('../../lib/io', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/io')>();
  return { ...actual, download: vi.fn() };
});
vi.mock('../../lib/confirm', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/confirm')>();
  return { ...actual, showConfirm: vi.fn() };
});

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let roots: Root[];

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

/** Seed persisted plotter prefs (see loadPlotterPrefs / sanitizePlotterOptions). */
function seedPrefs(opts: Record<string, number>): void {
  window.localStorage.setItem('vector.plotter.prefs', JSON.stringify({ opts }));
}

/** Axis-aligned rectangle ring at (x, y), w × h mm. */
function rectPath(id: string, color: string | undefined, x: number, y: number, w: number, h: number, kind: CutPath['kind'] = 'outline'): CutPath {
  return {
    id,
    points: [[x, y], [x + w, y], [x + w, y + h], [x, y + h], [x, y]],
    closed: true,
    kind,
    color,
  };
}

function regmark(id: string): CutPath {
  return { id, points: [[0, 0], [5, 0]], closed: false, kind: 'regmark' };
}

/** Two vinyl colours + a shared regmark — the layered-vinyl fixture. */
function layeredJob(): CutPath[] {
  return [
    rectPath('red', '#ff0000', 0, 0, 100, 100),   // 10 000 mm² → bottom
    rectPath('blue', '#0000ff', 200, 0, 50, 40),  // 2 000 mm² → top
    regmark('mark'),
  ];
}

const layerSection = (c: HTMLElement) =>
  c.querySelector<HTMLElement>('div[aria-label="Layers (multi-colour vinyl)"]');

const layerRow = (c: HTMLElement, color: string) =>
  c.querySelector<HTMLElement>(`div[data-plotter-layer="${color}"]`)!;

const rowButton = (row: HTMLElement, label: string) =>
  Array.from(row.querySelectorAll('button')).find(b => b.textContent === label)!;

const checkWeedingButton = (c: HTMLElement) =>
  Array.from(c.querySelectorAll('button')).find(b => b.textContent === 'Check weeding')!;

const weedHeader = (c: HTMLElement) =>
  Array.from(c.querySelectorAll('button')).find(b => b.textContent === 'Weed check (weeding preflight)')!;

const weedProfileButton = (c: HTMLElement, value: string) =>
  c.querySelector<HTMLButtonElement>(`span[aria-label="Weed check material profile"] button[data-value="${value}"]`)!;

function click(el: Element): void {
  act(() => {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  });
}

/** Click a button and drain the async handler's microtask chain inside one
 *  act, so streamJob's final state updates never land outside act. */
async function clickAsync(el: Element): Promise<void> {
  await act(async () => {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    await new Promise<void>(resolve => { setTimeout(resolve, 0); });
  });
}

/** Flush pending microtasks (async handlers like streamJob) inside act. */
async function flush(): Promise<void> {
  await act(async () => { /* drain the microtask queue */ });
}

/** Parse the job-estimate "~m:ss" out of the "Ready to output" summary. */
function summarySeconds(c: HTMLElement): number {
  const text = Array.from(c.querySelectorAll('span'))
    .find(s => s.textContent?.includes('Ready to output'))?.parentElement?.textContent ?? '';
  const m = text.match(/~(?:(\d+):)?(\d+):(\d{2})/);
  expect(m).not.toBeNull();
  return Number(m![1] ?? 0) * 3600 + Number(m![2]) * 60 + Number(m![3]);
}

beforeEach(() => {
  host = document.createElement('div');
  document.body.appendChild(host);
  roots = [];
  window.localStorage.clear();
  useEditor.setState({ cutPaths: [], showPlotter: false });
  vi.mocked(sendOverSerial).mockReset().mockResolvedValue(undefined);
  vi.mocked(showConfirm).mockReset().mockResolvedValue(true);
  vi.mocked(download).mockReset();
});

afterEach(() => {
  act(() => {
    for (const root of roots) root.unmount();
  });
  host.remove();
  vi.useRealTimers();
});

describe('PlotterDialog layers (multi-colour vinyl)', () => {
  it('stays hidden until the job has ≥2 vinyl colours', () => {
    useEditor.setState({ cutPaths: [rectPath('red', '#ff0000', 0, 0, 100, 100), regmark('mark')] });
    const c = mountDialog();
    expect(layerSection(c)).toBeNull();

    // Store update wrapped in act — the first dialog is still mounted and
    // subscribed to cutPaths.
    act(() => { useEditor.setState({ cutPaths: layeredJob() }); });
    const c2 = mountDialog();
    expect(layerSection(c2)).not.toBeNull();
    expect(c2.querySelectorAll('div[data-plotter-layer]')).toHaveLength(2);
  });

  it('orders rows bottom-first with the "1 = bottom" badge and per-colour stats', () => {
    useEditor.setState({ cutPaths: layeredJob() });
    const c = mountDialog();
    const rows = Array.from(c.querySelectorAll<HTMLElement>('div[data-plotter-layer]'));
    // Largest area (red, 10 000 mm²) is the bottom layer, order 1.
    expect(rows[0].getAttribute('data-plotter-layer')).toBe('#ff0000');
    expect(rows[0].textContent).toContain('1 = bottom');
    expect(rows[0].textContent).toContain('1 paths');
    expect(rows[0].textContent).toContain('10000 mm²');
    expect(rows[1].getAttribute('data-plotter-layer')).toBe('#0000ff');
    expect(rows[1].textContent).not.toContain('bottom');
    expect(rows[1].textContent).toContain('2');
    // Per-row actions + footer batch actions.
    for (const row of rows) {
      expect(rowButton(row, 'Send')).toBeTruthy();
      expect(rowButton(row, 'Save')).toBeTruthy();
    }
    expect(c.textContent).toContain('Send all layers');
    expect(c.textContent).toContain('Save all layers');
  });

  it('Save downloads a stamped per-layer file, and Save all staggers one per layer', () => {
    useEditor.setState({ cutPaths: layeredJob() });
    const c = mountDialog();

    click(rowButton(layerRow(c, '#ff0000'), 'Save'));
    expect(vi.mocked(download)).toHaveBeenCalledTimes(1);
    const [fileName, payload, mime] = vi.mocked(download).mock.calls[0];
    expect(fileName).toMatch(/^layer-1-ff0000-\d{8}-\d{4}\.(plt|hpgl|gcode)$/);
    expect(payload).toContain('PU'); // real machine code, not an empty payload
    expect(mime).toBe('text/plain');

    // Save all: layer 2's download fires 300 ms later (staggered).
    vi.useFakeTimers();
    vi.mocked(download).mockClear();
    act(() => {
      Array.from(c.querySelectorAll('button')).find(b => b.textContent === 'Save all layers')!
        .dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    });
    expect(vi.mocked(download)).toHaveBeenCalledTimes(1); // layer 1 immediate
    act(() => { vi.advanceTimersByTime(300); });
    expect(vi.mocked(download)).toHaveBeenCalledTimes(2);
    expect(vi.mocked(download).mock.calls[1][0]).toMatch(/^layer-2-0000ff-/);
  });

  it('Send all layers confirms between vinyl swaps; declining stops the sequence', async () => {
    useEditor.setState({ cutPaths: layeredJob() });
    const c = mountDialog();
    const sendAll = Array.from(c.querySelectorAll('button')).find(b => b.textContent === 'Send all layers')!;

    // Decline the swap after layer 1 → only one job streams.
    vi.mocked(showConfirm).mockResolvedValue(false);
    await clickAsync(sendAll);
    await flush();
    expect(vi.mocked(sendOverSerial)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(showConfirm)).toHaveBeenCalledTimes(1);

    // Confirm every swap → both layers stream, layer 2 confirmed as "2 of 2".
    vi.mocked(sendOverSerial).mockClear();
    vi.mocked(showConfirm).mockReset().mockResolvedValue(true);
    await clickAsync(sendAll);
    await flush();
    expect(vi.mocked(sendOverSerial)).toHaveBeenCalledTimes(2);
    expect(vi.mocked(showConfirm)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(showConfirm).mock.calls[0][0].message).toContain('Layer 2 of 2');
  });
});

describe('PlotterDialog weed check panel', () => {
  function openCodeTab(c: HTMLElement): void {
    click(c.querySelector('#plotter-preview-tab-code')!);
  }

  it('runs on demand and reports thin features with the summary line', () => {
    // 20 × 0.5 mm ring — a stroke no profile can weed.
    useEditor.setState({ cutPaths: [rectPath('thin', '#ff0000', 0, 0, 20, 0.5)] });
    const c = mountDialog();
    openCodeTab(c);

    expect(c.textContent).toContain('Weed check (weeding preflight)');
    // Manual like Preflight: nothing analysed before the button is pressed.
    expect(c.querySelector('#plotter-weed-check-body')!.textContent).toBe('');

    click(checkWeedingButton(c));
    expect(c.textContent).toContain('1 issues · 1 paths checked');
    const row = c.querySelector('#plotter-weed-check-body li');
    expect(row).not.toBeNull();
    expect(row!.textContent).toContain('Thin feature');
    expect(row!.textContent).toMatch(/\d\.\d mm/);
    expect(row!.textContent).toContain('1 paths');
  });

  it('switching the profile changes the weeding floors', () => {
    // 20 × 2 mm band — a stroke vinyl can weed (floor 1.5 mm) but glitter
    // HTV cannot (floor 3 mm): flagged only under that profile.
    useEditor.setState({ cutPaths: [rectPath('band', '#ff0000', 0, 0, 20, 2)] });
    const c = mountDialog();
    openCodeTab(c);

    click(checkWeedingButton(c));
    expect(c.textContent).toContain('0 issues · 1 paths checked');

    click(weedProfileButton(c, 'glitter-htv'));
    click(checkWeedingButton(c));
    expect(c.textContent).toContain('1 issues · 1 paths checked');
    expect(c.querySelector('#plotter-weed-check-body li')!.textContent).toContain('Thin feature');
  });

  it('skips with a notice past the max-paths guard', () => {
    const many: CutPath[] = Array.from({ length: 401 }, (_, i) =>
      rectPath(`p${i}`, undefined, i * 2, 0, 1, 1));
    useEditor.setState({ cutPaths: many });
    const c = mountDialog();
    openCodeTab(c);

    click(checkWeedingButton(c));
    expect(c.textContent).toContain('Weed check skipped — too many paths to analyse.');
  });

  it('collapses and expands', () => {
    useEditor.setState({ cutPaths: [rectPath('thin', '#ff0000', 0, 0, 20, 0.5)] });
    const c = mountDialog();
    openCodeTab(c);
    click(checkWeedingButton(c));
    expect(c.textContent).toContain('1 issues · 1 paths checked');

    const header = weedHeader(c);
    click(header);
    expect(header.getAttribute('aria-expanded')).toBe('false');
    expect(c.querySelector('#plotter-weed-check-body')).toBeNull();
    expect(c.textContent).not.toContain('1 issues');

    click(header);
    expect(header.getAttribute('aria-expanded')).toBe('true');
    expect(c.textContent).toContain('1 issues · 1 paths checked');
  });
});

describe('PlotterDialog estimate accuracy', () => {
  it('overcut + blade offset add their real seconds without changing the path count', () => {
    // One closed 100 × 60 mm ring (320 mm of cut). Slow the feed to 10 mm/min
    // so the drag-knife time sinks are visible after formatDuration rounds.
    const job = [rectPath('rect', '#ff0000', 10, 10, 100, 60)];

    seedPrefs({ feedRate: 10, travelRate: 10 }); // overcut 0 / blade 0
    useEditor.setState({ cutPaths: job });
    const baseline = mountDialog();
    const baselineSeconds = summarySeconds(baseline);
    // 320 mm cut + ~14 mm travel at 10 mm/min + 0.15 s overhead ≈ 2005 s.
    expect(baselineSeconds).toBeGreaterThan(1990);
    expect(baselineSeconds).toBeLessThan(2020);

    seedPrefs({ feedRate: 10, travelRate: 10, overcutMm: 0.5, bladeOffsetMm: 0.25 });
    const adjusted = mountDialog();
    const adjustedSeconds = summarySeconds(adjusted);
    // Delta has three real components at 10 mm/min (1 mm = 6 s):
    //  1. extra cut LENGTH from loops + retrace ≈ 3.5 mm → ≈ 21 s;
    //  2. estimateSeconds extras: overcut retrace 3 s + corner swing with the
    //     PRE-adjustment corner count (4 × π × 0.25 / (10/60) ≈ 18.8 s);
    //  3. travel shift ≈ 280 s — applyBladeOffset rotates the ring's seam to
    //     the longest-edge midpoint, and the machine's pen-up move to the new
    //     start vertex is genuinely longer ((0,0)→(60,10) vs (0,0)→(10,10)).
    // Total ≈ 323 s. The ceiling catches the corner-count inflation
    // regression (counting on blade-adjusted geometry gives 12 corners →
    // swing 56.5 s → delta ≈ 361 s).
    expect(adjustedSeconds - baselineSeconds).toBeGreaterThanOrEqual(300);
    expect(adjustedSeconds - baselineSeconds).toBeLessThanOrEqual(345);

    // Path count is stable — loops and retrace add vertices, never paths.
    const strip = (el: HTMLElement) =>
      el.querySelector('span[title="Estimated job time"]')!.parentElement!;
    expect(strip(baseline).lastElementChild!.textContent).toBe('1');
    expect(strip(adjusted).lastElementChild!.textContent).toBe('1');
  });
});

/** Seed persisted plotter prefs with opts + the selected material preset id
 *  (see loadPlotterPrefs — materialId rides the same blob). */
function seedPrefsMaterial(opts: Record<string, number>, materialId: string): void {
  window.localStorage.setItem('vector.plotter.prefs', JSON.stringify({ opts, materialId }));
}

/** All PU/PD coordinate pairs of an HP-GL payload, in statement order
 *  (plotter units = 40/mm). The bare-dialect footer park `PU0,0;` is
 *  dropped — it is a machine command, not geometry, so mirroring never
 *  touches it. */
function parseHpglCoords(payload: string): Array<[number, number]> {
  const pts: Array<[number, number]> = [];
  for (const line of payload.split('\n')) {
    if (line === 'PU0,0;') continue;
    if (!/^P[UD]-?\d/.test(line)) continue;
    const nums = line.replace(/^P[UD]/, '').replace(/;$/, '').split(',').map(Number);
    for (let i = 0; i + 1 < nums.length; i += 2) pts.push([nums[i], nums[i + 1]]);
  }
  return pts;
}

describe('PlotterDialog physics estimate (trapezoidal twin)', () => {
  it('appends the ≈ physics estimate when a material with accel is active and the numbers disagree', () => {
    // Same 100 × 60 mm ring as the classic-accuracy test, at 400 mm/min feed.
    // Classic estimate (length-based): 320 mm / 400 mm/min + 14 mm travel at
    // 3000 + 0.15 s overhead ≈ 48 s. Physics twin (sign-vinyl: 1500 mm/s²
    // accel, 0.15 s head-up, corner junction slowdowns): the three free
    // segments cruise at ~6.7 mm/s (≈ 15 / 9 / 15 s) but the closing seam
    // segment is cruise-capped by the seam corner turn (0.25 × feed → ≈ 36 s
    // for the last 60 mm) → ≈ 75 s. |75 − 48| > 1 s → the suffix shows.
    const job = [rectPath('rect', '#ff0000', 10, 10, 100, 60)];
    const strip = (c: HTMLElement) =>
      c.querySelector('span[title="Estimated job time"]')!.parentElement!;

    // Without a material preset (no accel constant) there is no physics twin.
    seedPrefs({ feedRate: 400, travelRate: 3000 });
    useEditor.setState({ cutPaths: job });
    const plain = mountDialog();
    expect(strip(plain).textContent).toContain('~');
    expect(strip(plain).textContent).not.toContain('≈');
    expect(summarySeconds(plain)).toBeGreaterThan(40); // ≈ 48 s, sanity

    // With 'sign-vinyl' (accelMmS2 1500) both numbers show in the stats row
    // and the "Ready to output" summary.
    seedPrefsMaterial({ feedRate: 400, travelRate: 3000 }, 'sign-vinyl');
    useEditor.setState({ cutPaths: job });
    const withMaterial = mountDialog();
    const row = strip(withMaterial).textContent ?? '';
    expect(row).toContain('≈');
    expect(row).toContain('(physics)');
    expect(Array.from(withMaterial.querySelectorAll('span'))
      .find(s => s.textContent?.includes('Ready to output'))?.parentElement?.textContent)
      .toContain('(physics)');
    // The classic number keeps its `~` slot: physics ≈ 75 s ≠ classic ≈ 48 s.
    expect(row).toMatch(/~0:48/);
    expect(row).toMatch(/≈1:1[45]/);
  });
});

describe('PlotterDialog per-layer mirror + trap', () => {
  it('toggling a layer’s mirror ships that layer’s file with x-coordinates flipped', () => {
    useEditor.setState({ cutPaths: layeredJob() });
    const c = mountDialog();
    const blueRow = layerRow(c, '#0000ff');
    const mirrorBox = blueRow.querySelector<HTMLInputElement>('input[type="checkbox"]')!;
    expect(mirrorBox.checked).toBe(false); // global mirror off

    // Baselines with the global setting: save both layers unmirrored.
    click(rowButton(layerRow(c, '#ff0000'), 'Save'));
    click(rowButton(blueRow, 'Save'));
    const payloadOf = (call: number): string => vi.mocked(download).mock.calls[call][1] as string;
    const redPlain = payloadOf(0);
    const plain = payloadOf(1);

    // Flip layer 2's mirror only → the saved payload is the mirrored job.
    click(mirrorBox);
    expect(mirrorBox.checked).toBe(true);
    vi.mocked(download).mockClear();
    click(rowButton(blueRow, 'Save'));
    expect(vi.mocked(download)).toHaveBeenCalledTimes(1);
    const mirrored = payloadOf(0);
    expect(mirrored).not.toBe(plain);

    // mirrorPolys flips x about the layer job's own bbox centre (minX+maxX),
    // leaving y alone — statement for statement, in plotter units.
    const plainPts = parseHpglCoords(plain);
    const mirroredPts = parseHpglCoords(mirrored);
    expect(mirroredPts.length).toBe(plainPts.length);
    expect(plainPts.length).toBeGreaterThan(4); // real geometry, not headers
    const axis = Math.min(...plainPts.map(p => p[0])) + Math.max(...plainPts.map(p => p[0]));
    for (let i = 0; i < plainPts.length; i++) {
      expect(mirroredPts[i][0]).toBe(axis - plainPts[i][0]);
      expect(mirroredPts[i][1]).toBe(plainPts[i][1]);
    }

    // The untouched row (layer 1) still follows the global setting — its
    // save is byte-identical to the pre-toggle baseline even now.
    vi.mocked(download).mockClear();
    click(rowButton(layerRow(c, '#ff0000'), 'Save'));
    expect(payloadOf(0)).toBe(redPlain);
  });

  it('Trap layers offsets the upper colour’s closed rings in the store', () => {
    useEditor.setState({ cutPaths: layeredJob() });
    const c = mountDialog();
    const original = layeredJob();

    click(Array.from(c.querySelectorAll('button')).find(b => b.textContent === 'Trap layers')!);

    const paths = useEditor.getState().cutPaths;
    const blue = paths.find(p => p.id === 'blue')!;
    const red = paths.find(p => p.id === 'red')!;
    const mark = paths.find(p => p.id === 'mark')!;
    // Upper colour: offset outward by the default 0.5 mm (± tessellation
    // slack), with round-join corner arcs growing the vertex count.
    expect(Math.min(...blue.points.map(p => p[0]))).toBeLessThanOrEqual(200 - 0.5 + 0.05);
    expect(blue.points.length).toBeGreaterThan(original[1].points.length);
    // Bottom colour + regmark byte-identical.
    expect(red).toEqual(original[0]);
    expect(mark).toEqual(original[2]);
  });
});

describe('PlotterDialog per-layer DXF + trap preview', () => {
  /** Open two-point coloured path (an upper layer with nothing trappable). */
  function linePath(id: string, color: string): CutPath {
    return { id, points: [[200, 0], [250, 0]], closed: false, kind: 'outline', color };
  }

  it('DXF downloads a stamped per-layer DXF with LAYER content, and Save all (DXF) staggers', () => {
    useEditor.setState({ cutPaths: layeredJob() });
    const c = mountDialog();

    click(rowButton(layerRow(c, '#ff0000'), 'DXF'));
    expect(vi.mocked(download)).toHaveBeenCalledTimes(1);
    const [fileName, payload, mime] = vi.mocked(download).mock.calls[0]!;
    // Same stamped-name pattern as saveLayer, but with the .dxf extension.
    expect(fileName).toMatch(/^layer-1-ff0000-\d{8}-\d{4}\.dxf$/);
    // The file body is the cut-path DXF: the layer's colour rides as a DXF
    // LAYER name (plus the shared regmark's kind layer).
    expect(payload).toContain('LWPOLYLINE');
    expect(payload).toContain('8\nFF0000');
    expect(payload).toContain('8\nREGMARK');
    expect(mime).toBe('text/plain');

    // Save all (DXF): same 300 ms stagger as Save all layers.
    vi.useFakeTimers();
    vi.mocked(download).mockClear();
    act(() => {
      Array.from(c.querySelectorAll('button')).find(b => b.textContent === 'Save all (DXF)')!
        .dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    });
    expect(vi.mocked(download)).toHaveBeenCalledTimes(1); // layer 1 immediate
    act(() => { vi.advanceTimersByTime(300); });
    expect(vi.mocked(download)).toHaveBeenCalledTimes(2);
    expect(vi.mocked(download).mock.calls[1]![0]).toMatch(/^layer-2-0000ff-\d{8}-\d{4}\.dxf$/);
    expect(vi.mocked(download).mock.calls[1]![1]).toContain('8\n0000FF');
  });

  it('trap preview shows the would-be count, recomputes when layers change, and disables Trap at 0', () => {
    // Three colours: red bottom (10 000 mm²), blue + green upper → N = 2.
    const threeColour = [
      rectPath('red', '#ff0000', 0, 0, 100, 100),
      rectPath('blue', '#0000ff', 200, 0, 50, 40),
      rectPath('green', '#00ff00', 300, 0, 30, 20),
      regmark('mark'),
    ];
    useEditor.setState({ cutPaths: threeColour });
    const c = mountDialog();

    // Tolerance guidance rides under the section header.
    expect(c.textContent).toContain('Layer alignment tolerance is ~0.5 mm');

    const preview = () => Array.from(c.querySelectorAll('span'))
      .find(s => s.textContent?.includes('paths will be offset'))!;
    expect(preview().textContent).toContain('2 paths will be offset');
    const trapButton = () => Array.from(c.querySelectorAll('button'))
      .find(b => b.textContent === 'Trap layers')! as HTMLButtonElement;
    expect(trapButton().disabled).toBe(false);

    // Green muted away from the job → layers recompute → only blue is
    // trappable, the preview follows.
    act(() => { useEditor.setState({ cutPaths: threeColour.slice(0, 2).concat(threeColour[3]!) }); });
    expect(preview().textContent).toContain('1 paths will be offset');

    // An upper colour with only OPEN geometry leaves nothing to trap: the
    // preview reads 0 and the Trap button is disabled.
    act(() => { useEditor.setState({ cutPaths: [threeColour[0]!, linePath('blue-open', '#0000ff'), threeColour[3]!] }); });
    expect(preview().textContent).toContain('0 paths will be offset');
    expect(trapButton().disabled).toBe(true);
    // …and the store was never touched by the previews.
    expect(useEditor.getState().cutPaths).toHaveLength(3);
    expect(useEditor.getState().cutPaths[1]!.points).toHaveLength(2);
  });
});

/* ---- Data-Link (network cutter) ----
 * The TCP-9100 barcode-handoff section (dataLink.ts / tcp_* Rust commands)
 * is native-only: hidden under the web/PWA runtime, visible under Tauri,
 * and its Connect & send runs the handshake over a mocked connection —
 * with log lines in the dialog and NONE of the serial/download paths used.
 *
 * runtime.isTauri is wrapped in a passthrough vi.fn (default behaviour
 * unchanged for the suites above); connectDataLink is mocked to a fake
 * handle so the REAL dataLinkHandshake runs end-to-end against scripted
 * cutter replies. Toasts become spies because no ToastHost is mounted. */

vi.mock('../../lib/runtime', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/runtime')>();
  return { ...actual, isTauri: vi.fn(actual.isTauri) };
});
vi.mock('../../lib/dataLink', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/dataLink')>();
  return { ...actual, connectDataLink: vi.fn() };
});
vi.mock('../../lib/toast', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/toast')>();
  return {
    ...actual,
    toast: {
      ...actual.toast,
      success: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
      info: vi.fn(),
    },
  };
});

import { isTauri } from '../../lib/runtime';
import { connectDataLink, type DataLinkHandle } from '../../lib/dataLink';
import { toast } from '../../lib/toast';

/** Scriptable fake cutter connection for connectDataLink (see the real
 *  handshake's own FakeHandle in dataLink.test.ts). */
class FakeCutterLink implements DataLinkHandle {
  readonly sent: string[] = [];
  private queue: string[];
  constructor(replies: string[]) {
    this.queue = [...replies];
  }
  async send(data: string): Promise<void> {
    this.sent.push(data);
  }
  async read(): Promise<string> {
    return this.queue.shift() ?? '';
  }
  close(): void { /* no-op in tests */ }
}

/** Type into a controlled React input (native setter + input event). */
function setInputValue(input: HTMLInputElement, value: string): void {
  act(() => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!;
    setter.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

const dataLinkHeader = (c: HTMLElement) =>
  c.querySelector<HTMLButtonElement>('button[aria-controls="plotter-datalink-body"]')!;

describe('PlotterDialog Data-Link (network cutter)', () => {
  afterEach(() => {
    vi.mocked(isTauri).mockRestore();
  });

  it('is hidden when the native runtime is inactive', () => {
    vi.mocked(isTauri).mockReturnValue(false);
    useEditor.setState({ cutPaths: layeredJob() });
    const c = mountDialog();
    expect(c.textContent).not.toContain('Data-Link (network cutter)');
  });

  it('is visible (collapsed) when the native runtime is active', () => {
    vi.mocked(isTauri).mockReturnValue(true);
    useEditor.setState({ cutPaths: layeredJob() });
    const c = mountDialog();
    expect(c.textContent).toContain('Data-Link (network cutter)');
    expect(dataLinkHeader(c).getAttribute('aria-expanded')).toBe('false');
    expect(c.querySelector('#plotter-datalink-body')).toBeNull();
  });

  it('Connect & send runs the handshake, shows log lines and toasts success — never the serial/download paths', async () => {
    vi.mocked(isTauri).mockReturnValue(true);
    useEditor.setState({ cutPaths: layeredJob() });
    const c = mountDialog();
    click(dataLinkHeader(c)); // expand

    // Default job name 'ANCHOR01' is pre-filled; the host starts empty and
    // must be typed in before the send.
    const host = c.querySelector<HTMLInputElement>('input[aria-label="Cutter host or IP"]')!;
    expect(c.querySelector<HTMLInputElement>('input[aria-label="Job name"]')!.value).toBe('ANCHOR01');
    setInputValue(host, '192.168.0.42');

    // Scripted cutter: ready → scanned ANCHOR01 → list ok → picks index 0
    // → accepts d5-less flow (no reg vector supplied by the dialog) → d6 ok.
    vi.mocked(connectDataLink).mockResolvedValue(new FakeCutterLink([
      '2\x03', 'ANCHOR01\x03', '0\x03', '0\x03', '0\x03',
    ]));
    vi.mocked(download).mockClear();
    vi.mocked(sendOverSerial).mockClear();
    vi.mocked(toast.success).mockClear();

    const sendButton = Array.from(c.querySelectorAll('button')).find(b => b.textContent === 'Connect & send')!;
    await clickAsync(sendButton);
    await flush();

    expect(vi.mocked(connectDataLink)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(connectDataLink)).toHaveBeenCalledWith('192.168.0.42', 9100);
    // Success toast + the handshake log rendered line by line.
    expect(vi.mocked(toast.success)).toHaveBeenCalledWith(expect.stringContaining('Data-Link'));
    const log = c.querySelector('#plotter-datalink-body pre[role="log"]');
    expect(log).not.toBeNull();
    expect(log!.textContent).toContain('d1 status');
    expect(log!.textContent).toContain('payload');
    // The handoff never touched the USB-serial stream or a file download.
    expect(vi.mocked(sendOverSerial)).not.toHaveBeenCalled();
    expect(vi.mocked(download)).not.toHaveBeenCalled();
    // Host persisted for the next open.
    expect(window.localStorage.getItem('vector.datalink.host')).toBe('192.168.0.42');
  });
});
