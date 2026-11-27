import { test, expect, type Locator, type Page } from './fixtures';
import * as fs from 'node:fs';

// Connecting a plotter, made cheap — plus a way to rehearse without one
// (2026-11, Impl-F2a). Driven on the running dev app, web shell:
//
//   ① the connection card lists the virtual plotter FIRST (it needs no
//      machine and works in every shell); connecting it shows the rehearsal
//      state and the positioning card
//   ② a jog moves the position read-out, Set origin zeroes it — in
//      rehearsal the read-out is live without switching on Auto status
//   ③ entering the Machine tab scans by itself: with one already-authorized
//      serial port (navigator.serial.getPorts(), faked per test) the card
//      says so and Connect needs no chooser — and nothing connects by itself
//   ④ once linked, the machine is identified without asking and the model
//      lands in the connection card
//
// Console policy: page errors must be zero; console errors must contain
// nothing from the plotter files.

const SHOTS = 'C:/tmp/aw_qa/implF2a';
const REHEARSAL = 'Rehearsal mode — nothing is sent to a real device';

function attachErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`PAGEERROR ${String(e).slice(0, 300)}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 300)); });
  return errors;
}

function expectNoPlotterErrors(errors: string[]): void {
  const pageErrors = errors.filter((e) => e.startsWith('PAGEERROR'));
  expect(pageErrors, pageErrors.join('\n')).toEqual([]);
  const mine = errors.filter((e) => /PlotterDialog|PlotterConsole|plotterLink|plotterScan/i.test(e));
  expect(mine, mine.join('\n')).toEqual([]);
}

interface SerialStub { getPorts: number; requestPort: number; opens: number; written: string }

/** navigator.serial WITHOUT an authorized port: nothing to scan, and a
 *  chooser the test never raises. */
async function stubSerialNone(page: Page): Promise<void> {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'serial', {
      configurable: true,
      value: {
        getPorts: async () => [],
        requestPort: () => Promise.reject(new DOMException(
          "Failed to execute 'requestPort' on 'Serial': No port selected by the user.", 'NotFoundError')),
      },
    });
  });
}

/** navigator.serial WITH exactly one previously authorized port. It is
 *  "unplugged" (opening it fails at once), so the scan reports honestly
 *  instead of hanging on probe timeouts. Counts every chooser request. */
async function stubSerialGranted(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const calls: SerialStub = { getPorts: 0, requestPort: 0, opens: 0, written: '' };
    (window as unknown as { __serialStub: SerialStub }).__serialStub = calls;
    const port = {
      getInfo: () => ({}),
      open: async () => { calls.opens++; throw new DOMException('Device unplugged.', 'NetworkError'); },
      close: async () => { /* nothing held */ },
      setSignals: async () => { /* not needed */ },
    };
    Object.defineProperty(navigator, 'serial', {
      configurable: true,
      value: {
        getPorts: async () => { calls.getPorts++; return [port]; },
        requestPort: () => {
          calls.requestPort++;
          return Promise.reject(new DOMException(
            "Failed to execute 'requestPort' on 'Serial': No port selected by the user.", 'NotFoundError'));
        },
      },
    });
  });
}
const serialStub = (page: Page): Promise<SerialStub> => page.evaluate(() => (window as unknown as { __serialStub: SerialStub }).__serialStub);

async function setupSession(page: Page): Promise<void> {
  await page.goto('/');
  await page.getByRole('menubar').waitFor({ state: 'visible', timeout: 20_000 });
  await page.locator('#main-canvas').waitFor({ state: 'attached', timeout: 20_000 });
  await page.waitForTimeout(600);
}

async function openMachineTab(page: Page): Promise<Locator> {
  await page.keyboard.press('Control+k');
  const input = page.locator('input[placeholder="Type a command or search…"]');
  await input.waitFor({ state: 'visible', timeout: 10_000 });
  await input.fill('Send to Plotter…');
  await page.waitForTimeout(300);
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog', { name: 'Send to Plotter / Cutter' });
  await dialog.waitFor({ state: 'visible', timeout: 10_000 });
  await page.waitForTimeout(500); // palette close + dialog open transition
  await dialog.locator('#plotter-tab-machine').click();
  await dialog.locator('#plotter-connect-card').waitFor({ state: 'visible' });
  return dialog;
}

const connectCard = (dialog: Locator) => dialog.locator('#plotter-connect-card');
const jogCard = (dialog: Locator) => dialog.locator('#plotter-jog-card');
const portSelect = (dialog: Locator) => dialog.locator('[data-testid="plotter-port-select"]');
const scanStatus = (dialog: Locator) => dialog.locator('[data-testid="plotter-scan-status"]');
const positionChip = (dialog: Locator) => connectCard(dialog).locator('[title^="Live carriage position"]');

async function chooseVirtualPlotter(dialog: Locator): Promise<void> {
  await expect(portSelect(dialog).locator('option').first()).toHaveText('Virtual plotter (rehearsal mode)');
  await portSelect(dialog).selectOption({ label: 'Virtual plotter (rehearsal mode)' });
}

async function connectVirtual(page: Page, dialog: Locator): Promise<void> {
  await chooseVirtualPlotter(dialog);
  await dialog.locator('#plotter-connect-primary').click();
  await expect(jogCard(dialog)).toBeVisible({ timeout: 10_000 });
  await expect(connectCard(dialog)).toHaveAttribute('data-plotter-sim', 'true');
}

async function shot(target: Locator, name: string): Promise<void> {
  fs.mkdirSync(SHOTS, { recursive: true });
  await target.screenshot({ path: `${SHOTS}/${name}.png` });
}

for (const vp of [{ name: '1440x900', width: 1440, height: 900 }, { name: '960x600', width: 960, height: 600 }]) {
  test(`① ${vp.name}: the virtual plotter is the first port; connecting it enters rehearsal`, async ({ page }) => {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    const errors = attachErrors(page);
    await stubSerialGranted(page);
    await setupSession(page);
    const dialog = await openMachineTab(page);

    await expect(portSelect(dialog).locator('option').first()).toHaveText('Virtual plotter (rehearsal mode)');
    // The automatic scan has had its say (the authorized port is unplugged)…
    await expect(scanStatus(dialog)).toContainText('No cutter answered on any port', { timeout: 15_000 });
    // …the virtual plotter sits above it in the list…
    await chooseVirtualPlotter(dialog);
    await expect(portSelect(dialog)).toHaveValue(/virtual:/);
    // …and nothing is connected yet: no positioning card, nothing to jog.
    await expect(dialog.locator('#plotter-jog-card')).toHaveCount(0);
    await expect(connectCard(dialog)).toContainText('Not connected');
    await shot(connectCard(dialog), `connect-card-${vp.name}`);

    await dialog.locator('#plotter-connect-primary').click();
    await expect(jogCard(dialog)).toBeVisible({ timeout: 10_000 });
    await expect(connectCard(dialog)).toHaveAttribute('data-plotter-sim', 'true');
    await expect(connectCard(dialog)).toContainText(REHEARSAL);
    await expect(jogCard(dialog).locator('[data-testid="plotter-rehearsal-badge"]')).toHaveText(REHEARSAL);
    await expect(dialog.locator('#plotter-connect-primary')).toHaveText(/Disconnect/);

    expectNoPlotterErrors(errors);
  });
}

test('② a jog moves the read-out; Set origin zeroes it', async ({ page }) => {
  const errors = attachErrors(page);
  await stubSerialNone(page);
  await setupSession(page);
  const dialog = await openMachineTab(page);
  await connectVirtual(page, dialog);

  // Live right after connecting — no Auto status needed in rehearsal.
  await expect(positionChip(dialog)).toContainText('X 0.0 · Y 0.0 mm', { timeout: 10_000 });

  await dialog.getByRole('button', { name: 'Move right', exact: true }).click();
  await expect(positionChip(dialog)).toContainText('X 10.0 · Y 0.0 mm', { timeout: 10_000 });

  await dialog.getByRole('button', { name: 'Move up', exact: true }).click();
  await expect(positionChip(dialog)).toContainText('X 10.0 · Y 10.0 mm', { timeout: 10_000 });

  await dialog.getByRole('button', { name: 'Set origin', exact: true }).click();
  await expect(positionChip(dialog)).toContainText('X 0.0 · Y 0.0 mm', { timeout: 10_000 });

  for (const vp of [{ name: '1440x900', width: 1440, height: 900 }, { name: '960x600', width: 960, height: 600 }]) {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.waitForTimeout(250);
    await shot(connectCard(dialog), `position-card-${vp.name}`); // read-out + identify result live here
    await shot(dialog, `machine-rehearsal-${vp.name}`);
  }
  expectNoPlotterErrors(errors);
});

test('③ entering the Machine tab scans by itself: one authorized port is offered, the chooser is not raised, nothing connects', async ({ page }) => {
  const errors = attachErrors(page);
  await stubSerialGranted(page);
  await setupSession(page);
  const dialog = await openMachineTab(page);

  // The scan result is on screen without any click…
  await expect(connectCard(dialog)).toContainText('Last used serial port', { timeout: 10_000 });
  // …the primary action is a plain Connect (the port is authorized)…
  await expect(dialog.locator('#plotter-connect-primary')).toHaveText(/Connect/);
  await expect(dialog.locator('#plotter-connect-primary')).not.toHaveText(/Choose/);
  // …the one candidate was probed, and it said nothing (unplugged)…
  await expect(scanStatus(dialog)).toContainText('No cutter answered on any port', { timeout: 15_000 });
  const stub = await serialStub(page);
  expect(stub.getPorts).toBeGreaterThan(0);
  expect(stub.opens).toBeGreaterThan(0); // the probe tried the authorized port
  expect(stub.requestPort).toBe(0); // never the chooser, never unasked
  // …and nothing was connected on the operator's behalf.
  await expect(connectCard(dialog)).toContainText('Not connected');
  await expect(dialog.locator('#plotter-jog-card')).toHaveCount(0);

  await chooseVirtualPlotter(dialog);
  await shot(connectCard(dialog), 'connect-card-scanned-1440x900');
  expectNoPlotterErrors(errors);
});

test('④ connected: the machine is identified by itself — the model lands in the connection card', async ({ page }) => {
  const errors = attachErrors(page);
  await stubSerialNone(page);
  await setupSession(page);
  const dialog = await openMachineTab(page);
  await connectVirtual(page, dialog);

  const result = dialog.locator('[data-testid="plotter-identify-result"]');
  await expect(result).toContainText('SIMULATED-PLOTTER', { timeout: 10_000 });
  await expect(result).toContainText('Machine:');
  // The virtual machine matches no brand profile — there is nothing to apply.
  await expect(dialog.locator('[data-testid="plotter-apply-profile"]')).toHaveCount(0);
  expectNoPlotterErrors(errors);
});

test('⑤ the virtual plotter chosen but NOT connected: a footer Test cut connects it implicitly and rehearses', async ({ page }) => {
  const errors = attachErrors(page);
  await stubSerialGranted(page);
  await setupSession(page);
  const dialog = await openMachineTab(page);

  // Pick the virtual plotter in the port list and stop there — Connect is never clicked.
  await chooseVirtualPlotter(dialog);
  await expect(dialog.locator('#plotter-jog-card')).toHaveCount(0);
  await expect(connectCard(dialog)).toContainText('Not connected');

  // A footer action needs a link; the implicit connect must go to the virtual
  // plotter (the chosen "port"), not to the serial port or the browser chooser.
  await dialog.getByRole('button', { name: /Test cut/i }).click();
  await expect(connectCard(dialog)).toHaveAttribute('data-plotter-sim', 'true', { timeout: 10_000 });
  await expect(jogCard(dialog).locator('[data-testid="plotter-rehearsal-badge"]')).toHaveText(REHEARSAL);
  await expect(dialog.locator('#plotter-connect-primary')).toHaveText(/Disconnect/);
  expect((await serialStub(page)).requestPort).toBe(0);

  expectNoPlotterErrors(errors);
});
