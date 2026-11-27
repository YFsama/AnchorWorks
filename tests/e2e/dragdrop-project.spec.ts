import { fileURLToPath } from 'node:url';
import * as fs from 'node:fs';
import { test, expect, type Page } from './fixtures';

// A saved project that reaches the app without its own picker — dropped on the
// window, or picked by the generic "Open SVG / JSON…" dialog — opens as a
// project. It used to be handed to the raw canvas-JSON loader, which cleared
// the canvas and restored nothing: the project did not open, and the objects
// that were open were gone as well.
//
//   ① dropped on an empty canvas: opens, no question asked
//   ② dropped on a canvas that holds work: asks first; Cancel keeps everything
//   ③ the same drop answered Open: the project replaces the design
//   ④ dropped together with other files: opens first, so they land inside it
//   ⑤ a plain canvas state (what Export JSON writes) still replaces the objects
//      only — and asks too when they hold work
//   ⑥ the "Open SVG / JSON…" picker opens a project the same way

const OBJECTS = '[role="status"][aria-label^="Objects"]';
/** The hidden input File ▸ Open SVG / JSON… clicks. */
const OPEN_INPUT = 'input[type="file"][accept=".svg,.json"]';
const PROJECT_PATH = fileURLToPath(new URL('./fixtures/three-rects.vstudio.json', import.meta.url));
const TWO_RECTS_SVG = fileURLToPath(new URL('./fixtures/two-rects.svg', import.meta.url));
const PROJECT_NAME = 'three-rects.vstudio.json';

interface DropFile { name: string; type: string; text?: string; png?: [number, number] }

const rect = (left: number): Record<string, unknown> => ({ type: 'rect', left, top: 100, width: 80, height: 60, fill: '#333333' });
/** What "Export JSON" writes: a plain Fabric canvas state, no envelope. */
const canvasState = (count: number): string => JSON.stringify({
  version: '7.0.0',
  background: '#ffffff',
  objects: Array.from({ length: count }, (_, i) => rect(40 + i * 150)),
});

async function boot(page: Page): Promise<void> {
  await page.goto('/');
  await expect(page.getByRole('menubar')).toBeVisible();
  await page.locator('#main-canvas').waitFor({ state: 'attached' });
  await expect(page.locator(OBJECTS)).toHaveAttribute('aria-label', /^Objects \d+$/);
}

/** One synthetic file drop at the centre of the canvas. */
async function dropOnCanvas(page: Page, files: DropFile[]): Promise<void> {
  const box = await page.locator('#main-canvas').boundingBox();
  expect(box).not.toBeNull();
  const x = Math.round(box!.x + box!.width / 2);
  const y = Math.round(box!.y + box!.height / 2);
  await page.evaluate(({ x, y, files }) => {
    const dt = new DataTransfer();
    for (const f of files) {
      let file: File;
      if (f.png) {
        const c = document.createElement('canvas');
        c.width = f.png[0];
        c.height = f.png[1];
        const g = c.getContext('2d')!;
        g.fillStyle = '#ff2e9a';
        g.fillRect(0, 0, c.width, c.height);
        const bin = atob(c.toDataURL('image/png').split(',')[1]);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        file = new File([bytes], f.name, { type: f.type });
      } else {
        file = new File([f.text ?? 'x'], f.name, { type: f.type });
      }
      dt.items.add(file);
    }
    const target = document.elementFromPoint(x, y) ?? document.body;
    const init = { bubbles: true, cancelable: true, composed: true, dataTransfer: dt, clientX: x, clientY: y };
    for (const type of ['dragenter', 'dragover', 'drop']) target.dispatchEvent(new DragEvent(type, init));
  }, { x, y, files });
}

const project = (): DropFile => ({ name: PROJECT_NAME, type: 'application/json', text: fs.readFileSync(PROJECT_PATH, 'utf8') });
const openedToast = (page: Page) => page.locator('.toast-item').filter({ hasText: `Opened ${PROJECT_NAME}` });

test('① a project dropped on an empty canvas opens, no question asked', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));
  await boot(page);

  await dropOnCanvas(page, [project()]);

  await expect(page.locator(OBJECTS)).toHaveAttribute('aria-label', /^Objects 3$/, { timeout: 10_000 });
  await expect(page.getByRole('alertdialog')).toHaveCount(0);
  await expect(openedToast(page)).toBeVisible();
  expect(errors).toEqual([]);
});

test('②③ dropped on a canvas that holds work: it asks first — Cancel keeps everything, Open replaces it', async ({ page }) => {
  await boot(page);
  // Work on the canvas: the two-rects fixture imports as one group.
  await page.locator(OPEN_INPUT).setInputFiles(TWO_RECTS_SVG);
  await expect(page.locator(OBJECTS)).toHaveAttribute('aria-label', /^Objects 1$/);

  await dropOnCanvas(page, [project()]);
  const ask = page.getByRole('alertdialog');
  await expect(ask).toBeVisible({ timeout: 10_000 });
  await expect(ask).toContainText(PROJECT_NAME);
  await expect(ask).toContainText('replaces the design that is open now — artboards and symbols included.');

  // ② Cancel: the design stays exactly as it was.
  await ask.getByRole('button', { name: 'Cancel' }).click();
  await expect(ask).toHaveCount(0);
  await page.waitForTimeout(400);
  await expect(page.locator(OBJECTS)).toHaveAttribute('aria-label', /^Objects 1$/);
  await expect(openedToast(page)).toHaveCount(0);

  // ③ Open: the project takes the canvas.
  await dropOnCanvas(page, [project()]);
  await expect(ask).toBeVisible({ timeout: 10_000 });
  await ask.getByRole('button', { name: 'Open', exact: true }).click();
  await expect(page.locator(OBJECTS)).toHaveAttribute('aria-label', /^Objects 3$/);
  await expect(openedToast(page)).toBeVisible();
});

test('④ dropped together with other files: the project opens first, so they land inside it', async ({ page }) => {
  await boot(page);
  // In the drop the image comes first. Imported before the project, it would
  // land in the empty design the project then replaces — and be lost.
  await dropOnCanvas(page, [{ name: 'a-logo.png', type: 'image/png', png: [24, 24] }, project()]);

  await expect(page.locator(OBJECTS)).toHaveAttribute('aria-label', /^Objects 4$/, { timeout: 10_000 });
  await expect(page.getByRole('alertdialog')).toHaveCount(0);
});

test('⑤ a plain canvas state still replaces the objects only — and asks too when they hold work', async ({ page }) => {
  await boot(page);
  const state = (count: number): DropFile => ({ name: 'export.json', type: 'application/json', text: canvasState(count) });

  // An empty canvas: straight in, and it is not announced as an opened project.
  await dropOnCanvas(page, [state(2)]);
  await expect(page.locator(OBJECTS)).toHaveAttribute('aria-label', /^Objects 2$/, { timeout: 10_000 });
  await expect(page.getByRole('alertdialog')).toHaveCount(0);
  await expect(openedToast(page)).toHaveCount(0);

  // Objects on the canvas: asked, with the narrower promise.
  await dropOnCanvas(page, [state(1)]);
  const ask = page.getByRole('alertdialog');
  await expect(ask).toContainText('export.json');
  await expect(ask).toContainText(/replaces the objects on the canvas\./);
  await expect(ask).not.toContainText('artboards');
  await ask.getByRole('button', { name: 'Import', exact: true }).click();
  await expect(page.locator(OBJECTS)).toHaveAttribute('aria-label', /^Objects 1$/);
});

test('⑥ the "Open SVG / JSON…" picker opens a project the same way', async ({ page }) => {
  await boot(page);
  await page.locator(OPEN_INPUT).setInputFiles(PROJECT_PATH);
  await expect(page.locator(OBJECTS)).toHaveAttribute('aria-label', /^Objects 3$/);
  await expect(openedToast(page)).toBeVisible();
});
