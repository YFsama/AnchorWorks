import { test, expect } from './fixtures';

// Command palette — lazy-load + rotation nesting wave coverage. The palette
// chunk is code-split and only mounts on first invocation, so this spec
// guards the very first Ctrl+K (chunk fetch + mount) rather than a warm
// reopen, and that the rotation-aware nest command is discoverable via the
// standard 'nest' search.
test('first Ctrl+K opens the lazy palette and searching nest finds the rotation-aware command', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('[role="menubar"]')).toBeVisible();

  // First open on a cold page — exercises the dynamic import path. The lazy
  // chunk needs a beat to fetch, so allow the same budget help.spec uses.
  await page.keyboard.press('Control+K');
  const dialog = page.getByRole('dialog', { name: /command palette/i });
  await expect(dialog).toBeVisible({ timeout: 10_000 });

  const search = dialog.locator('input[placeholder="Type a command or search…"]');
  await expect(search).toBeVisible();

  // 'nest' matches a swarm of rhinestone/group commands by keyword, but the
  // rotation-aware nesting entry must be among them (it exists in both the
  // File and Arrange categories — assert at least one, don't pin the count).
  await search.fill('nest');
  const nestOptions = dialog.locator('[role="option"]').filter({ hasText: /nest \(rotation-aware\)/i });
  await expect(nestOptions.first()).toBeVisible();

  // Escape closes — but the input's first Escape clears a non-empty query
  // (CommandPalette consumes it), so empty the box before the closing press.
  await search.fill('');
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
});
