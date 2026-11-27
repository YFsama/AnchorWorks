import { test, expect, type Locator, type Page } from './fixtures';
import * as fs from 'node:fs';
import { lintJob } from '../../src/lib/hpglDebug';

// Plotter dialog — "Calibrate & test" workbench, job progress card and the
// canvas preview switch (Impl-F2b), driven with real pointer / keyboard input
// on the running dev app:
//
//   ① the tab sits between Cut settings and Machine, and the arrow keys reach it
//   ② unlinked, every "Cut test" goes through the dialog's ONE link gate:
//      a readable hint and the Machine tab — never a raw browser exception
//   ③ linked through a fake serial port, the ruler test puts clean HP-GL on
//      the wire (checked with the project's own lintJob)
//   ④ "Use" in the blade / overcut tables lands in the Cut settings fields
//   ⑤ "Show on canvas" fills the store's canvasCutPreview and clears it again
//   ⑥ a job shows the progress card while sending, then "sent — the machine
//      may still be running"; it never claims "complete" from the transfer
//      alone, dialog open or closed
//   ⑦ rehearsal: the built-in virtual plotter shows what was cut and reports
//      completion only once every move has executed
//
// Console policy: page errors must be zero; nothing from the plotter files
// may print a console error.

const SHOTS = 'C:/tmp/aw_qa/implF2b';

function attachErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`PAGEERROR ${String(e).slice(0, 300)}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 300)); });
  return errors;
}

function expectNoPlotterErrors(errors: string[]): void {
  const pageErrors = errors.filter((e) => e.startsWith('PAGEERROR'));
  expect(pageErrors, pageErrors.join('\n')).toEqual([]);
  const mine = errors.filter((e) => /PlotterDialog|PlotterConsole|PlotterCalibration|PlotterStatusChip|plotterJobMonitor|CutPreview|plotterLink|plotterGuards|plotterCalibration/i.test(e));
  expect(mine, mine.join('\n')).toEqual([]);
}

/** navigator.serial stub (same shape as plotter-flow.spec.ts): counts chooser
 *  requests, can "cancel", and records every byte written to a fake port
 *  that never answers. Installed before the app boots. */
async function stubSerial(page: Page, { cancel = false } = {}): Promise<void> {
  await page.addInitScript(({ cancel: doCancel }) => {
    type Stub = { requestPort: number; open: number; openArgs: unknown; written: string; cancel: boolean };
    const calls: Stub = { requestPort: 0, open: 0, openArgs: null, written: '', cancel: !!doCancel };
    (window as unknown as { __plotterStub: Stub }).__plotterStub = calls;
    const makePort = () => ({
      open: async (o: unknown) => { calls.open++; calls.openArgs = o; },
      close: async () => { /* released */ },
      setSignals: async () => { /* not needed */ },
      getInfo: () => ({}),
      readable: new ReadableStream<Uint8Array>({ start() { /* stays open */ } }),
      writable: new WritableStream<Uint8Array>({
        write(chunk: Uint8Array) { calls.written += new TextDecoder().decode(chunk); },
      }),
    });
    Object.defineProperty(navigator, 'serial', {
      configurable: true,
      value: {
        getPorts: async () => [],
        requestPort: () => {
          calls.requestPort++;
          if (calls.cancel) {
            return Promise.reject(new DOMException(
              "Failed to execute 'requestPort' on 'Serial': No port selected by the user.", 'NotFoundError'));
          }
          return Promise.resolve(makePort());
        },
      },
    });
  }, { cancel });
}

interface SerialStub { requestPort: number; open: number; openArgs: { baudRate: number } | null; written: string }
const stub = (page: Page): Promise<SerialStub> => page.evaluate(() => (window as unknown as { __plotterStub: SerialStub }).__plotterStub);

/** Pre-seed the dialog's persisted settings (plotter.ts loadPlotterPrefs). */
async function seedPrefs(page: Page, prefs: Record<string, unknown>): Promise<void> {
  await page.addInitScript((p) => {
    try { window.localStorage.setItem('vector.plotter.prefs', JSON.stringify(p)); } catch { /* ignore */ }
  }, prefs);
}

async function setupSession(page: Page, rects: Array<readonly [number, number, number, number]> = [[-60, -40, 140, 70]]): Promise<void> {
  await page.goto('/');
  await page.getByRole('menubar').waitFor({ state: 'visible', timeout: 20_000 });
  await page.locator('#main-canvas').waitFor({ state: 'attached', timeout: 20_000 });
  await page.waitForTimeout(600);
  const { width: vw, height: vh } = page.viewportSize()!;
  for (const [dx, dy, w, h] of rects) {
    await page.click('button[data-tool="rect"]');
    await page.mouse.move(vw / 2 + dx, vh / 2 + dy);
    await page.mouse.down();
    await page.mouse.move(vw / 2 + dx + w, vh / 2 + dy + h, { steps: 6 });
    await page.mouse.up();
  }
  await page.click('button[data-tool="select"]');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  if (rects.length) await expect(page.getByText(new RegExp(`Objects\\s+${rects.length}\\b`)).first()).toBeVisible({ timeout: 10_000 });
}

async function openPlotter(page: Page): Promise<Locator> {
  await page.keyboard.press('Control+k');
  const input = page.locator('input[placeholder="Type a command or search…"]');
  await input.waitFor({ state: 'visible', timeout: 10_000 });
  await input.fill('Send to Plotter…');
  await page.waitForTimeout(300);
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog', { name: 'Send to Plotter / Cutter' });
  await dialog.waitFor({ state: 'visible', timeout: 10_000 });
  await page.waitForTimeout(500); // palette close + dialog open transition
  return dialog;
}

const footer = (dialog: Locator, label: string) => dialog.locator('[aria-label="Plotter output actions"]').getByRole('button', { name: label, exact: true });
const selectedTabId = (dialog: Locator) => dialog.locator('[role="tablist"][aria-label="Plotter sections"] [aria-selected="true"]').getAttribute('id');
const pane = (dialog: Locator) => dialog.locator('[data-plotter-pane="calibrate"]');
const card = (dialog: Locator, id: string) => dialog.locator(`[data-plotter-card="cal-${id}"]`);
const cutButton = (dialog: Locator, which: string) => pane(dialog).locator(`[data-plotter-cal-cut="${which}"]`);
/** The dialog footer's job card (the status-bar chip carries the same attribute). */
const jobCard = (dialog: Locator) => dialog.locator('[role="status"][data-plotter-job]');
const chip = (page: Page) => page.locator('button[data-status-action][data-plotter-job]');
/** A Cut settings number input, by the text of the <label> that wraps it. */
const cutField = (dialog: Locator, labelText: string) => dialog.locator('[data-plotter-pane="cut"] label').filter({ hasText: labelText }).locator('input[type="number"]').first();

/**
 * The cut-preview overlay (CutPathLayer) exists only while the editor holds a
 * job preview, and marks its canvas with the preview's path count — plus a
 * mirror flag when mirroring is on. Read off the DOM, so it works on the
 * production build as much as on the dev server.
 */
const CUT_OVERLAY = '#main-canvas canvas[data-cut-preview]';

interface CanvasPreview { paths: number; mirror: boolean }

const readCanvasPreview = (page: Page): Promise<CanvasPreview | null> => page.evaluate((sel) => {
  const el = document.querySelector(sel);
  return el ? { paths: Number(el.getAttribute('data-cut-preview')), mirror: el.getAttribute('data-cut-preview-mirror') === 'true' } : null;
}, CUT_OVERLAY);

interface CutPreviewPixels {
  /** The material band's top and bottom rules, CSS px from the canvas's top edge. */
  bandTop: number;
  bandBottom: number;
  /** Bounding box of the preview cut lines (CSS px). */
  job: { left: number; right: number; top: number; bottom: number };
  /** Rows along the job's left edge that a line crosses: above the job, and below it down to the band's bottom rule. */
  guideAbove: number;
  guideBelow: number;
  /** Lowest such row below the job (CSS px); -1 when there is none. */
  guideLow: number;
}

/**
 * The preview's geometry, measured on the overlay canvas's own pixels: the
 * band rules are the layer's only full-width strokes, the preview cut lines
 * its only magenta, and the L-guide from the machine origin to the job runs
 * along the job's left edge — above the job for a top-left origin, below it
 * for a bottom-left one. null until the layer has drawn.
 */
const readCutPreviewPixels = (page: Page): Promise<CutPreviewPixels | null> =>
  page.locator(CUT_OVERLAY).evaluate((el) => {
    const c = el as HTMLCanvasElement;
    const W = c.width, H = c.height;
    const k = W / c.getBoundingClientRect().width; // backing-store px per CSS px (device pixel ratio)
    const d = c.getContext('2d')!.getImageData(0, 0, W, H).data;
    const alpha = (x: number, y: number) => d[(y * W + x) * 4 + 3];
    // #ff2e9a over its dark halo: red enough, green-poor, and bluer than the "outside the material" red.
    const isCutLine = (x: number, y: number) => { const i = (y * W + x) * 4; return d[i] >= 200 && d[i + 1] <= 130 && d[i + 2] >= 130; };
    let l = W, r = -1, t = H, b = -1;
    const rules: number[] = [];
    for (let y = 0; y < H; y++) {
      let marked = 0;
      for (let x = 0; x < W; x++) {
        if (alpha(x, y) >= 120) marked++;
        if (isCutLine(x, y)) { l = Math.min(l, x); r = Math.max(r, x); t = Math.min(t, y); b = Math.max(b, y); }
      }
      if (marked >= W * 0.35) rules.push(y);
    }
    if (r < 0 || rules.length === 0) return null;
    const bandTop = rules[0], bandBottom = rules[rules.length - 1] + 1;
    // The L-guide is a 1 px dashed line on the job's left edge: look in a 6 px column around it.
    const x0 = Math.max(0, l - 1), x1 = Math.min(W - 1, l + 5);
    const marks = (yFrom: number, yTo: number) => {
      let rows = 0, low = -1;
      for (let y = Math.max(0, Math.round(yFrom)); y < Math.min(H, Math.round(yTo)); y++) {
        let cols = 0;
        for (let x = x0; x <= x1; x++) if (alpha(x, y) >= 60) cols++;
        // A line crossing this 6 px column marks a few pixels of a row; a filled label chip marks them all.
        if (cols > 0 && cols <= 3) { rows++; low = y; }
      }
      return { rows, low };
    };
    const above = marks(bandTop + 4 * k, t - 14 * k);
    const below = marks(b + 14 * k, bandBottom - 4 * k);
    return {
      bandTop: bandTop / k,
      bandBottom: bandBottom / k,
      job: { left: l / k, right: (r + 1) / k, top: t / k, bottom: (b + 1) / k },
      guideAbove: above.rows,
      guideBelow: below.rows,
      guideLow: below.low < 0 ? -1 : (below.low + 1) / k,
    };
  });

async function shot(page: Page, dialog: Locator, name: string): Promise<void> {
  fs.mkdirSync(SHOTS, { recursive: true });
  await dialog.screenshot({ path: `${SHOTS}/${name}.png` });
}

async function cardShot(dialog: Locator, id: string, name: string): Promise<void> {
  fs.mkdirSync(SHOTS, { recursive: true });
  await card(dialog, id).screenshot({ path: `${SHOTS}/${name}.png` });
}

async function gotoCalibrate(page: Page, dialog: Locator): Promise<void> {
  await dialog.locator('#plotter-tab-calibrate').click();
  await expect(pane(dialog)).toBeVisible();
  await page.waitForTimeout(200);
}

async function expectFirstCardOnScreen(dialog: Locator, id: string): Promise<void> {
  // Geometry proof: the scroll container is at the top and the whole first
  // card lies inside its visible box, which lies inside the viewport.
  const geo = await pane(dialog).evaluate((el, cardId) => {
    const scroller = el.closest('.overflow-y-auto') as HTMLElement;
    const first = el.querySelector(`[data-plotter-card="cal-${cardId}"]`) as HTMLElement;
    const s = scroller.getBoundingClientRect();
    const c = first.getBoundingClientRect();
    const dlg = el.closest('[role="dialog"] > div') as HTMLElement;
    const d = dlg.getBoundingClientRect();
    const hit = document.elementFromPoint(c.left + c.width / 2, c.top + Math.min(12, c.height / 2));
    return {
      scrollTop: scroller.scrollTop,
      cardTopInScroller: Math.round(c.top - s.top),
      cardBottomInScroller: Math.round(s.bottom - c.bottom),
      cardHeight: Math.round(c.height),
      insideDialogX: c.left >= d.left && c.right <= d.right + 0.5,
      noHorizontalScroll: scroller.scrollWidth <= scroller.clientWidth + 1,
      covered: !!(hit && first.contains(hit)),
    };
  }, id);
  expect(geo.scrollTop).toBe(0);
  expect(geo.cardTopInScroller).toBeGreaterThanOrEqual(0);
  expect(geo.cardBottomInScroller).toBeGreaterThanOrEqual(0); // visible WITHOUT scrolling
  expect(geo.insideDialogX).toBe(true);
  expect(geo.noHorizontalScroll).toBe(true);
  expect(geo.covered).toBe(true);
}

async function expectFooterClickable(dialog: Locator): Promise<void> {
  const send = footer(dialog, 'Send via USB');
  await expect(send).toBeEnabled();
  expect(await send.evaluate((n) => {
    const r = (n as HTMLElement).getBoundingClientRect();
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return r.top >= 0 && r.bottom <= innerHeight && r.left >= 0 && r.right <= innerWidth && !!hit && (hit === n || n.contains(hit));
  })).toBe(true);
}

test.describe('plotter dialog — Calibrate & test, job progress, canvas preview', () => {
  test('① the tab reads Output → Cut settings → Calibrate & test → Machine; arrows reach it; cards and previews render', async ({ page }) => {
    const errors = attachErrors(page);
    await setupSession(page);
    const dialog = await openPlotter(page);

    const tabs = dialog.locator('[role="tablist"][aria-label="Plotter sections"] [role="tab"]');
    expect((await tabs.allTextContents()).map((s) => s.trim())).toEqual(['Output', 'Cut settings', 'Calibrate & test', 'Machine']);
    await expect(dialog.locator('#plotter-tab-calibrate')).toHaveAttribute('tabindex', '-1');

    // Keyboard: click Cut settings, then (→) Calibrate & test → (→) Machine → (←) back.
    await dialog.locator('#plotter-tab-cut').click();
    await expect(selectedTabId(dialog)).resolves.toBe('plotter-tab-cut');
    await page.keyboard.press('ArrowRight');
    await expect(selectedTabId(dialog)).resolves.toBe('plotter-tab-calibrate');
    await expect(dialog.locator('#plotter-tab-calibrate')).toBeFocused();
    await expect(pane(dialog)).toBeVisible();
    await page.keyboard.press('ArrowRight');
    await expect(selectedTabId(dialog)).resolves.toBe('plotter-tab-machine');
    await page.keyboard.press('ArrowLeft');
    await expect(selectedTabId(dialog)).resolves.toBe('plotter-tab-calibrate');
    await page.keyboard.press('End');
    await expect(selectedTabId(dialog)).resolves.toBe('plotter-tab-machine');
    await page.keyboard.press('Home');
    await expect(selectedTabId(dialog)).resolves.toBe('plotter-tab-output');

    await gotoCalibrate(page, dialog);
    for (const id of ['blade', 'overcut', 'calculator', 'distance', 'dry-run', 'positioning', 'drift']) {
      await expect(card(dialog, id)).toBeAttached();
    }
    // Every test has its cut button; no rehearsal badge while nothing is simulated.
    for (const which of ['blade', 'overcut', 'distance', 'dry-run', 'origin', 'corners', 'ruler', 'drift']) {
      await expect(cutButton(dialog, which)).toHaveCount(1);
    }
    await expect(dialog.locator('[data-plotter-cal-rehearsal]')).toHaveCount(0);
    expect(await pane(dialog).locator('svg[data-plotter-cal-preview]').count()).toBeGreaterThanOrEqual(7);
    // Blade row: 6 numbered cells, 6 "Use" buttons.
    await expect(card(dialog, 'blade').locator('[data-plotter-cal-use]')).toHaveCount(6);
    await expect(card(dialog, 'overcut').locator('[data-plotter-cal-use-overcut]')).toHaveCount(5);
    await expectFirstCardOnScreen(dialog, 'blade');
    await expectFooterClickable(dialog);
    await shot(page, dialog, 'calibrate-1440x900');
    await cardShot(dialog, 'blade', 'card-blade-1440x900');
    await cardShot(dialog, 'distance', 'card-distance-1440x900');
    await cardShot(dialog, 'positioning', 'card-positioning-1440x900');
    await cardShot(dialog, 'dry-run', 'card-dry-run-1440x900');
    expectNoPlotterErrors(errors);
  });

  test('① 960×600: the first card is on screen and the pinned footer stays clickable', async ({ page }) => {
    const errors = attachErrors(page);
    await page.setViewportSize({ width: 960, height: 600 });
    await setupSession(page);
    const dialog = await openPlotter(page);
    await gotoCalibrate(page, dialog);
    await expectFirstCardOnScreen(dialog, 'blade');
    await expectFooterClickable(dialog);
    const box = (await dialog.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(960);
    await shot(page, dialog, 'calibrate-960x600');
    // Cards scroll into view intact (no horizontal clipping) and keep their buttons hit-testable.
    for (const id of ['distance', 'positioning']) {
      const b = card(dialog, id);
      await b.scrollIntoViewIfNeeded();
      const r = (await b.boundingBox())!;
      expect(r.x).toBeGreaterThanOrEqual(box.x);
      expect(r.x + r.width).toBeLessThanOrEqual(box.x + box.width + 0.5);
      const btn = b.locator('[data-plotter-cal-cut]').first();
      expect(await btn.evaluate((n) => {
        const q = (n as HTMLElement).getBoundingClientRect();
        const hit = document.elementFromPoint(q.left + q.width / 2, q.top + q.height / 2);
        return !!hit && (hit === n || n.contains(hit));
      }), id).toBe(true);
    }
    await cardShot(dialog, 'distance', 'card-distance-960x600');
    await cardShot(dialog, 'blade', 'card-blade-960x600');
    expectNoPlotterErrors(errors);
  });

  test('② unlinked: the tests go through the link gate — readable hint, Machine tab, nothing sent, no raw browser text', async ({ page }) => {
    await page.setViewportSize({ width: 960, height: 600 });
    await stubSerial(page, { cancel: true });
    const errors = attachErrors(page);
    await setupSession(page);
    const dialog = await openPlotter(page);

    await gotoCalibrate(page, dialog);
    await cutButton(dialog, 'ruler').click();
    await expect.poll(async () => (await stub(page)).requestPort).toBe(1);
    await expect(page.getByText(/Port selection cancelled/).first()).toBeVisible();
    await expect(page.getByText(/Failed to execute|requestPort|No port selected by the user/)).toHaveCount(0);
    await expect(selectedTabId(dialog)).resolves.toBe('plotter-tab-machine');
    await expect(dialog.locator('[data-plotter-card="connect"]')).toBeVisible();
    await expect(dialog.locator('[data-plotter-card="connect"]')).toContainText('Not connected');
    expect((await stub(page)).open).toBe(0);
    expect((await stub(page)).written).toBe('');

    // Back to the workbench: a second test takes the same gate.
    await gotoCalibrate(page, dialog);
    await cutButton(dialog, 'blade').click();
    await expect.poll(async () => (await stub(page)).requestPort).toBe(2);
    await expect(page.getByText(/Port selection cancelled/).first()).toBeVisible();
    await expect(selectedTabId(dialog)).resolves.toBe('plotter-tab-machine');
    await expect(page.getByText(/Sent to plotter|Test cut sent|Cut complete/)).toHaveCount(0);
    expect((await stub(page)).written).toBe('');
    await shot(page, dialog, 'unlinked-gate-960x600');
    expectNoPlotterErrors(errors);
  });

  test('③ linked on demand: the ruler test streams clean HP-GL to the fake port — 10 ticks per axis, lint zero errors', async ({ page }) => {
    await stubSerial(page);
    const errors = attachErrors(page);
    await setupSession(page);
    const dialog = await openPlotter(page);
    await gotoCalibrate(page, dialog);

    await cutButton(dialog, 'ruler').click();
    await expect.poll(async () => (await stub(page)).open, { timeout: 8_000 }).toBe(1);
    await expect.poll(async () => (await stub(page)).written, { timeout: 8_000 }).toContain('SP0;');
    const wire = (await stub(page)).written;
    // The link was primed first (area query), then the ruler job: it selects
    // the pen and never sends IN; — that resets the scaling points, i.e. the
    // origin the operator just set, which this pattern exists to check.
    expect(writtenJob(wire).startsWith('SP1;')).toBe(true);
    const job = writtenJob(wire);
    expect(job).not.toMatch(/(?<![A-Za-z])IN;/);
    expect(wire.indexOf('SP0;')).toBeGreaterThan(wire.indexOf('OH;')); // prime first, job after
    // Baselines run from the origin to +100 mm on both axes (40 plotter units / mm).
    expect(job).toContain('PU0,0;\nPD4000,0;');
    expect(job).toContain('PU0,0;\nPD0,4000;');
    // A tick every 10 mm: 10 per axis, 5 mm long (200 units), 8 mm (320) at 50 and 100.
    const xTicks = [...job.matchAll(/PU(\d+),0;\nPD\1,(200|320);/g)];
    const yTicks = [...job.matchAll(/PU0,(\d+);\nPD(200|320),\1;/g)];
    expect(xTicks.map((m) => Number(m[1]) / 40)).toEqual([10, 20, 30, 40, 50, 60, 70, 80, 90, 100]);
    expect(yTicks.map((m) => Number(m[1]) / 40)).toEqual([10, 20, 30, 40, 50, 60, 70, 80, 90, 100]);
    expect(xTicks.map((m) => m[2])).toEqual(['200', '200', '200', '200', '320', '200', '200', '200', '200', '320']);
    // Nothing left of the origin, and nothing but the job's own statements.
    expect([...job.matchAll(/PU(-\d+)/g)]).toHaveLength(0);
    expect(job).not.toContain('!PG'); // never ejects the sheet
    // The project's own preflight: zero ERROR-level issues.
    const lint = lintJob('hpgl', job, { unit: 'mm', originBottomLeft: true, paperHeightUnits: 210, penDownZ: -1, penUpZ: 5 });
    expect(lint.issues.filter((i) => i.severity === 'error').map((i) => i.message)).toEqual([]);
    // Still on the workbench; the link is up; the transfer result was reported.
    await expect(selectedTabId(dialog)).resolves.toBe('plotter-tab-calibrate');
    await expect(page.getByText(/Ruler: .*Sent to plotter/).first()).toBeVisible({ timeout: 8_000 });
    // The fake port answers no status poll: the card says so, and never claims completion.
    await expect(jobCard(dialog)).toHaveAttribute('data-plotter-job', /sent|unwatched/);
    await expect(jobCard(dialog)).not.toContainText(/Cut complete/);
    await expect(cutButton(dialog, 'ruler')).toBeEnabled();
    await shot(page, dialog, 'ruler-sent-1440x900');
    expectNoPlotterErrors(errors);
  });

  test('④ "Use" in the blade / overcut tables lands in the Cut settings fields', async ({ page }) => {
    const errors = attachErrors(page);
    await setupSession(page);
    const dialog = await openPlotter(page);
    await gotoCalibrate(page, dialog);

    await pane(dialog).locator('[data-plotter-cal-use="0.25"]').click();
    await dialog.locator('#plotter-tab-cut').click();
    await expect(cutField(dialog, 'Blade offset (mm)')).toHaveValue('0.25');

    await gotoCalibrate(page, dialog);
    await pane(dialog).locator('[data-plotter-cal-use="0.6"]').click();
    await dialog.locator('#plotter-tab-cut').click();
    await expect(cutField(dialog, 'Blade offset (mm)')).toHaveValue('0.6');

    await gotoCalibrate(page, dialog);
    await pane(dialog).locator('[data-plotter-cal-use-overcut="0.3"]').click();
    await dialog.locator('#plotter-tab-cut').click();
    await expect(cutField(dialog, 'Overcut (mm)')).toHaveValue('0.3');
    await expect(cutField(dialog, 'Blade offset (mm)')).toHaveValue('0.6'); // untouched by the overcut table
    expectNoPlotterErrors(errors);
  });

  test('⑤ "Show on canvas": the store preview fills while on, and clears when switched off or the dialog closes', async ({ page }) => {
    const errors = attachErrors(page);
    await setupSession(page);
    expect(await readCanvasPreview(page)).toBeNull(); // nothing triggers it before the switch
    // Zoom out to 50 % so the whole material band is on screen to measure.
    await page.getByRole('button', { name: /^Zoom \d+%$/ }).click();
    await page.getByRole('textbox', { name: /^Zoom$/ }).fill('50');
    await page.keyboard.press('Enter');
    await expect(page.getByRole('button', { name: 'Zoom 50%', exact: true })).toBeVisible();
    const dialog = await openPlotter(page);

    const toggle = dialog.locator('#plotter-show-on-canvas');
    await expect(toggle).toHaveAttribute('aria-pressed', 'false');
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-pressed', 'true');
    await expect.poll(async () => (await readCanvasPreview(page))?.paths ?? 0).toBeGreaterThan(0);
    // The rect drawn in the session: one cut path in document mm, not mirrored.
    const preview = (await readCanvasPreview(page))!;
    expect(preview.paths).toBe(1);
    expect(preview.mirror).toBe(false);
    // …as the overlay draws it. Document mm = CSS px ÷ zoom ÷ 3.7795 px/mm.
    await expect.poll(async () => (await readCutPreviewPixels(page)) !== null).toBe(true);
    const px = (await readCutPreviewPixels(page))!;
    const mm = (css: number) => css / (0.5 * 3.7795);
    // A 210 mm tall material band…
    expect(Math.abs(mm(px.bandBottom - px.bandTop) - 210)).toBeLessThanOrEqual(1.5);
    // …holding the 140 × 70 px rect the session drew (37 × 18.5 mm)…
    const w = mm(px.job.right - px.job.left), h = mm(px.job.bottom - px.job.top);
    expect(w).toBeGreaterThan(30);
    expect(w).toBeLessThan(45);
    expect(h).toBeGreaterThan(10);
    expect(h).toBeLessThan(25);
    // …measured from a bottom-left origin: the L-guide leaves the machine
    // origin on the band's BOTTOM rule and runs up the job's left edge.
    expect(px.guideBelow).toBeGreaterThanOrEqual(40);
    expect(px.guideBelow).toBeGreaterThanOrEqual(3 * px.guideAbove);
    // …reaching that rule: the guide's lowest dash ends within a dash period (5 px) of it.
    expect(px.bandBottom - px.guideLow).toBeLessThanOrEqual(8);
    await shot(page, dialog, 'show-on-canvas-1440x900');

    // Off again → cleared at once.
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-pressed', 'false');
    expect(await readCanvasPreview(page)).toBeNull();

    // On, then the dialog is closed → the overlay must not outlive the dialog.
    await toggle.click();
    await expect.poll(async () => (await readCanvasPreview(page))?.paths ?? 0).toBeGreaterThan(0);
    await footer(dialog, 'Cancel').click();
    await expect(dialog).toBeHidden();
    await expect.poll(async () => (await readCanvasPreview(page))?.paths ?? -1).toBe(-1);
    expectNoPlotterErrors(errors);
  });

  test('⑥ job progress: visible while sending, then "sent — the machine may still be running"; never "complete" from the transfer alone — chip included', async ({ page }) => {
    // 1200 baud paces the stream at one 256-byte chunk per 2.56 s, so the phases are observable.
    await seedPrefs(page, { baud: 1200 });
    await stubSerial(page);
    const errors = attachErrors(page);
    // Ten rectangles ≈ 570 bytes of HP-GL = three 256-byte chunks → ~5 s of transfer.
    const rects: Array<readonly [number, number, number, number]> = [];
    for (let i = 0; i < 10; i++) rects.push([-330 + (i % 5) * 135, -110 + Math.floor(i / 5) * 120, 110, 90]);
    await setupSession(page, rects);
    const dialog = await openPlotter(page);

    await footer(dialog, 'Send via USB').click();
    // Connecting on demand (chooser → fake port → area query), then the stream.
    await expect(jobCard(dialog)).toHaveAttribute('data-plotter-job', 'sending', { timeout: 10_000 });
    await expect(jobCard(dialog)).toContainText(/Sending \d+\/\d+ B \(\d+%\)/);
    await expect(jobCard(dialog)).toContainText('elapsed');
    await expect(jobCard(dialog)).toContainText('paths');
    await expect(dialog.getByRole('button', { name: 'Stop job', exact: true })).toBeEnabled();
    await shot(page, dialog, 'progress-sending-1440x900');

    // Transfer finished: the machine has not said anything yet — this is NOT "complete".
    await expect(jobCard(dialog)).toHaveAttribute('data-plotter-job', 'sent', { timeout: 15_000 });
    await expect(jobCard(dialog)).toContainText('Sent — the machine may still be running');
    await expect(dialog.getByText(/Cut complete/)).toHaveCount(0);
    await expect(page.getByText(/Cut complete/)).toHaveCount(0);
    await shot(page, dialog, 'progress-sent-1440x900');

    // Close the dialog mid-phase: the status chip carries the same story.
    await footer(dialog, 'Cancel').click();
    await expect(dialog).toBeHidden();
    const chipEl = chip(page);
    await expect(chipEl).toBeVisible();
    await expect(chipEl).not.toHaveAttribute('data-plotter-job', 'idle', { timeout: 500 });
    await expect(chipEl).toHaveAttribute('data-plotter-job', /sent|unwatched/);
    await expect(chipEl).toContainText(/Cutting…|Sent — watch by eye/);
    // The fake port never answers status polls: after two silent polls the watch gives up honestly.
    await expect(chipEl).toHaveAttribute('data-plotter-job', 'unwatched', { timeout: 15_000 });
    await expect(chipEl.getByTitle(/does not report status/)).toBeVisible();
    await expect(page.getByText(/Cut complete/)).toHaveCount(0);
    await page.screenshot({ path: `${SHOTS}/chip-unwatched-1440x900.png` });
    expectNoPlotterErrors(errors);
  });

  test('⑦ rehearsal: the virtual plotter shows what was cut and reports completion only when every move has run', async ({ page }) => {
    test.setTimeout(90_000); // the virtual plotter walks the ruler at real feed rates
    const errors = attachErrors(page);
    await setupSession(page);
    const dialog = await openPlotter(page);
    await gotoCalibrate(page, dialog);
    await expect(card(dialog, 'rehearsal')).toHaveCount(0);

    await pane(dialog).locator('[data-plotter-cal-action="rehearse"]').click();
    await expect(dialog.locator('[data-plotter-cal-rehearsal]').first()).toBeVisible({ timeout: 8_000 });
    await expect(card(dialog, 'rehearsal')).toBeVisible();
    await expect(pane(dialog).locator('[data-plotter-cal-action="rehearse"]')).toHaveCount(0);

    await cutButton(dialog, 'ruler').click();
    await expect(jobCard(dialog)).toHaveAttribute('data-plotter-job', /sending|busy|done/, { timeout: 8_000 });
    await expect(jobCard(dialog)).toHaveAttribute('data-plotter-job', 'done', { timeout: 60_000 });
    await expect(jobCard(dialog)).toContainText('Cut complete — the machine reports idle');
    // The result view has the toolpath the virtual plotter walked: blade-down strokes in the cut colour.
    const svg = card(dialog, 'rehearsal').locator('svg[data-plotter-cal-rehearsal-svg]');
    expect(await svg.locator('path[stroke="#ff2e9a"]').count()).toBeGreaterThan(10);
    await card(dialog, 'rehearsal').scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);
    await shot(page, dialog, 'calibrate-rehearsal-1440x900');
    await cardShot(dialog, 'rehearsal', 'card-rehearsal-1440x900');
    expectNoPlotterErrors(errors);
  });
});

/** The job slice of what reached the port: from the pen it selects to its `SP0;`.
 *  Calibration patterns carry no `IN;` — it would reset the origin the operator set. */
function writtenJob(wire: string): string {
  const end = wire.indexOf('SP0;');
  const start = wire.lastIndexOf('SP1;', end >= 0 ? end : undefined);
  return start >= 0 ? wire.slice(start, end >= 0 ? end + 4 : undefined) : wire;
}
