import { test, expect } from './fixtures';

// Theme toggle — Anchorworks applies the active theme via a
// `data-theme="light" | "dark"` attribute on <html>. The toggle is reachable
// from Help → Light/Dark Theme and via the Ctrl+Shift+L keyboard shortcut
// (registered in keymap.ts as `view.toggleTheme`).
//
// Both surfaces are covered here so a regression in either path is caught:
//   - keyboard shortcut wiring (App.tsx -> setTheme)
//   - menu item -> setTheme
test('Ctrl+Shift+L toggles between light and dark theme', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('[role="menubar"]')).toBeVisible();
  const html = page.locator('html');

  // Capture the starting theme — the editor seeds it from localStorage or
  // prefers-color-scheme, so we don't pin a specific initial value.
  const initial = await html.getAttribute('data-theme');
  expect(['light', 'dark']).toContain(initial);
  const other = initial === 'light' ? 'dark' : 'light';

  // First toggle — flips to the opposite theme.
  await page.keyboard.press('Control+Shift+L');
  await expect(html).toHaveAttribute('data-theme', other);

  // Second toggle — returns to the starting theme.
  await page.keyboard.press('Control+Shift+L');
  await expect(html).toHaveAttribute('data-theme', initial);
});

test('Help menu Light Theme item toggles the theme attribute', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('[role="menubar"]')).toBeVisible();
  const html = page.locator('html');
  const initial = await html.getAttribute('data-theme');
  const other = initial === 'light' ? 'dark' : 'light';

  // The Help dropdown opens on hover (CSS group-hover, see MenuBar.tsx). Hover
  // the menubar trigger first to make the menu items reachable.
  const helpTrigger = page.getByRole('menuitem', { name: 'Help' }).first();
  await helpTrigger.hover();

  // The Light/Dark item's label switches based on current theme — it reads
  // "Light Theme" in dark mode and "Dark Theme" in light mode. The item is
  // a `menuitemcheckbox` (W3C ARIA — it's a toggle, the ✓ shown when active
  // is now a separate Check icon, not part of the label).
  const themeItem = page.getByRole('menu', { name: 'Help' })
    .getByRole('menuitemcheckbox', { name: /^(Light|Dark) Theme$/ });
  await themeItem.first().click();

  await expect(html).toHaveAttribute('data-theme', other);
});
