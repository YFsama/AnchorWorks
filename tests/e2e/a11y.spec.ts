import { test, expect } from './fixtures';
import { test as baseTest } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

// Accessibility audit suite for Anchorworks.
//
// Each test scans a specific surface with axe-core and fails on any WCAG
// 2.1 A/AA violation. We deliberately tag the run with the four
// WCAG-tagged rule sets so we get coverage but not the experimental /
// best-practice categories (those tend to be noisy on a canvas-heavy app).
//
// If a violation is intentionally suppressed, prefer a focused .skip() with
// a `// TODO axe:` comment naming the rule id and the offending component.
const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

// Common axe options. The canvas pane is rendered via fabric.js into a
// <canvas> element — colour-contrast on pixel buffers isn't meaningful and
// axe can hang attempting to analyse it. We exclude the canvas via the
// builder's `.exclude()` method on a per-test basis (so we still scan the
// chrome around it).
const CANVAS_EXCLUDES = ['.canvas-host', 'canvas'];

test('home page passes axe WCAG 2.1 AA checks', async ({ page }) => {
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  // Wait for chrome to land so we're not racing against React mount.
  await expect(page.locator('[role="menubar"]')).toBeVisible();

  const results = await new AxeBuilder({ page })
    .withTags(WCAG_TAGS)
    .exclude(CANVAS_EXCLUDES)
    .analyze();

  expect(results.violations).toEqual([]);
});

test('command palette passes axe WCAG 2.1 AA checks', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('[role="menubar"]')).toBeVisible();
  await page.keyboard.press('Control+K');
  const dialog = page.getByRole('dialog', { name: /command palette/i });
  await expect(dialog).toBeVisible();

  const results = await new AxeBuilder({ page })
    .withTags(WCAG_TAGS)
    .exclude(CANVAS_EXCLUDES)
    .analyze();

  expect(results.violations).toEqual([]);
});

test('help center passes axe WCAG 2.1 AA checks', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('[role="menubar"]')).toBeVisible();
  await page.keyboard.press('F1');
  const dialog = page.getByRole('dialog', { name: /help center/i });
  await expect(dialog).toBeVisible({ timeout: 10_000 });

  const results = await new AxeBuilder({ page })
    .withTags(WCAG_TAGS)
    .exclude(CANVAS_EXCLUDES)
    .analyze();

  expect(results.violations).toEqual([]);
});

test('preferences dialog passes axe WCAG 2.1 AA checks', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('[role="menubar"]')).toBeVisible();
  // Cmd/Ctrl+, opens preferences (see App.tsx).
  await page.keyboard.press('Control+,');
  const dialog = page.getByRole('dialog', { name: /preferences/i });
  await expect(dialog).toBeVisible({ timeout: 10_000 });

  const results = await new AxeBuilder({ page })
    .withTags(WCAG_TAGS)
    .exclude(CANVAS_EXCLUDES)
    .analyze();

  expect(results.violations).toEqual([]);
});

// Onboarding modal is shown on first run only — the shared fixture pre-seeds
// `vector.onboarded=true` so it never appears. For this scan we override the
// init script with a fresh page that clears the flag before navigation.
baseTest('onboarding modal passes axe WCAG 2.1 AA checks', async ({ page }) => {
  await page.addInitScript(() => {
    try {
      window.localStorage.removeItem('vector.onboarded');
    } catch {
      /* ignore */
    }
  });
  await page.goto('/');
  const dialog = page.getByRole('dialog', { name: /welcome|onboarding|getting started/i });
  await expect(dialog).toBeVisible({ timeout: 10_000 });

  const results = await new AxeBuilder({ page })
    .withTags(WCAG_TAGS)
    .exclude(CANVAS_EXCLUDES)
    .analyze();

  expect(results.violations).toEqual([]);
});
