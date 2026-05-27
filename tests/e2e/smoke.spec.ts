import { test, expect } from './fixtures';

// Smoke test — confirms the bundle parses, React mounts, the splash hides,
// and the three top-level chrome regions (menu bar, toolbar, status bar)
// all render. If any of these fail, virtually nothing else will work.
test('app boots, splash hides, and chrome renders', async ({ page }) => {
  // Don't wait for the full load event before our assertions — Vite's preview
  // server can still be fetching chunks when React already painted the shell.
  await page.goto('/', { waitUntil: 'domcontentloaded' });

  // #root should become non-empty within 5s — this is the React-mount signal
  // that the inline splash-hide script watches for. (The splash itself races
  // against this assertion, so we don't poll for its presence — only its
  // eventual removal below.)
  await expect.poll(
    async () => page.locator('#root *').count(),
    { timeout: 5_000 },
  ).toBeGreaterThan(0);

  // Document title is set statically in index.html — easiest cheap check.
  await expect(page).toHaveTitle('Anchorworks');

  // Top-level chrome regions. The selectors below match the live DOM:
  //   MenuBar  — role="menubar" on the top strip
  //   Toolbar  — role="toolbar" on the left rail (also serves as a tool-count guard)
  //   StatusBar — role="status" along the bottom of the canvas pane
  await expect(page.locator('[role="menubar"]')).toBeVisible();
  const toolbar = page.locator('[role="toolbar"]').first();
  await expect(toolbar).toBeVisible();
  // 11 tools today: Select, Rect, Ellipse, Line, Polygon, Pen, Pencil,
  // Eraser, Text, Hand, Zoom. Asserting count guards against accidental removal.
  await expect(toolbar.locator('button')).toHaveCount(11);

  await expect(page.locator('[role="status"]').first()).toBeVisible();

  // Splash should be gone (or invisible) once React has handed off.
  await expect(page.locator('#splash')).toHaveCount(0, { timeout: 5_000 });
});
