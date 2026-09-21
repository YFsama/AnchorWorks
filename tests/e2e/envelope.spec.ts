import { test, expect } from './fixtures';

// Envelope Distort — Make with Top Object (Document → Distort & Transform,
// also in the command palette). With nothing selected the command must
// resolve to a null outcome and explain itself through the warn toast —
// a crash here (or a silent no-op) is the regression this spec guards.
test('envelope distort entry exists and warns on an invalid selection', async ({ page }) => {
  // Surface-level console noise is part of the contract — an uncaught throw
  // inside the envelope promise chain would land here even if the toast
  // still rendered.
  const errors: string[] = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));

  await page.goto('/');
  await expect(page.locator('[role="menubar"]')).toBeVisible();

  // MenuBar dropdowns are CSS-hover surfaces (group-hover reveals the
  // panel), so hover Document open, then the Distort & Transform row to fly
  // out its submenu. getByRole only matches the now-visible items, which
  // keeps each lookup unique without attachment gymnastics.
  await page.getByRole('menuitem', { name: 'Document' }).hover();
  await page.getByRole('menuitem', { name: 'Distort & Transform' }).hover();

  const envelopeItem = page.getByRole('menuitem', { name: 'Envelope Distort — Make with Top Object' });
  await expect(envelopeItem).toBeVisible();

  // Nothing is selected: envelopeSelection() returns null (< 2 active
  // objects) and the menu handler answers with the explanatory warn toast
  // (title + "top-most object becomes the envelope" message). Warn toasts
  // render as role="alert" in ToastHost.
  await envelopeItem.click();
  const toast = page.getByRole('alert');
  await expect(toast).toBeVisible();
  await expect(toast).toContainText('Envelope Distort');
  await expect(toast).toContainText('the top-most object becomes the envelope');

  expect(errors).toEqual([]);
});
