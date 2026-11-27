import { test, expect, toolsToolbar, type Page } from './fixtures';

// Session save & restore (Impl-B) — end-to-end contract for the recovery
// flow. The blocking recovery modal used to appear on EVERY launch that had
// an autosave entry, including empty documents and perfectly normal closes.
// Now:
//
//   - an empty document never leaves a recoverable entry,
//   - only a real crash (exit mark `vector.sessionExit` = clean:false) with
//     unsaved work opens the modal,
//   - a normal close with unsaved work gets a non-blocking toast with
//     Restore / Ignore,
//   - File ▸ Restore Last Session… is the manual route back,
//   - File ▸ New clears the session before it reloads.
//
// Autosave is switched to a 1 s tick through `vector.prefs` so the suite
// never waits on the 30 s default.
//
// Dev-server note: React logs one unrelated console.error in dev mode
// (PropertiesPanel render-time Toolbar update, tracked separately), so this
// spec deliberately makes no zero-console-error assertion.

const AUTOSAVE = 'vector.autosave';
const EXIT = 'vector.sessionExit';
const QUIET_TITLE = 'Unsaved changes from your last session';

/** A crash-leftover written in the real entry shape (canvas.toJSON() + counters). */
const CRASH_ENTRY = {
  json: {
    version: '7.4.0',
    objects: [{ type: 'rect', left: 100, top: 100, width: 200, height: 150, fill: '#ff0000' }],
    background: '#ffffff',
  },
  ts: Date.now(),
  changeSeq: 3,
};

/** 1 s autosave tick for every navigation of this page. */
async function fastAutosave(page: Page): Promise<void> {
  await page.addInitScript((key) => {
    try {
      const prefs = JSON.parse(window.localStorage.getItem(key) || '{}');
      window.localStorage.setItem(key, JSON.stringify({ ...prefs, autosaveIntervalMs: 1000 }));
    } catch {
      /* private mode — ignore */
    }
  }, 'vector.prefs');
}

/** Seed a crash + its unsaved entry ONCE, before the app's scripts run. */
async function seedCrash(page: Page): Promise<void> {
  await page.addInitScript(({ autosave, exit, entry }) => {
    const flag = '__recoveryCrashSeeded';
    if (window.localStorage.getItem(flag)) return;
    window.localStorage.setItem(flag, '1');
    window.localStorage.setItem(autosave, JSON.stringify(entry));
    window.localStorage.setItem(exit, JSON.stringify({ clean: false, at: Date.now() }));
  }, { autosave: AUTOSAVE, exit: EXIT, entry: CRASH_ENTRY });
}

async function appReady(page: Page): Promise<void> {
  // MenuBar is lazy-loaded, so a visible menubar also means the shell's
  // chunks (incl. the boot effects) have landed.
  await expect(page.locator('[role="menubar"]')).toBeVisible();
}

/** Let the 550 ms boot decision (and a few autosave ticks) definitely pass. */
async function settleBoot(page: Page): Promise<void> {
  await appReady(page);
  await page.waitForTimeout(1500);
}

function objectsLabel(page: Page) {
  return page.locator('[role="group"][aria-label="Editor status"] [aria-label^="Objects "]').first();
}

async function expectObjects(page: Page, n: number): Promise<void> {
  await expect(objectsLabel(page)).toHaveAttribute('aria-label', new RegExp(`Objects ${n}$`));
}

/** One drag-drawn rectangle (drawing.spec.ts / confirm-behavior.spec.ts sequence). */
async function drawOneRect(page: Page): Promise<void> {
  const toolbar = toolsToolbar(page);
  await expect(toolbar).toBeVisible();
  await page.keyboard.press('r');
  const canvas = page.locator('#main-canvas');
  const box = await canvas.boundingBox();
  if (!box) throw new Error('canvas has no bounding box');
  await page.mouse.move(box.x + 300, box.y + 300);
  await page.mouse.down();
  await page.mouse.move(box.x + 350, box.y + 325);
  await page.mouse.move(box.x + 500, box.y + 450);
  await page.mouse.up();
  await page.keyboard.press('v');
}

const autosavedObjectCount = (page: Page) =>
  page.evaluate((key) => {
    const raw = window.localStorage.getItem(key);
    if (!raw) return -1;
    try {
      return ((JSON.parse(raw) as { json?: { objects?: unknown[] } }).json?.objects ?? []).length;
    } catch {
      return -2;
    }
  }, AUTOSAVE);

const hasAutosave = (page: Page) => page.evaluate((key) => window.localStorage.getItem(key) !== null, AUTOSAVE);

async function openFileMenu(page: Page): Promise<void> {
  await page.getByRole('menuitem', { name: 'File', exact: true }).first().hover();
  await page.waitForTimeout(350);
}

const quietToast = (page: Page) => page.locator('.toast-item').filter({ hasText: QUIET_TITLE });

test.describe('session save & restore', () => {
  // Each test pays several uncached dev-server loads.
  test.describe.configure({ timeout: 75_000 });

  test('① normal session: draw → autosave → reload ⇒ no modal, quiet prompt, Restore brings the work back', async ({ page }) => {
    await fastAutosave(page);
    await page.goto('/');
    await drawOneRect(page);
    await expectObjects(page, 1);
    await expect.poll(() => autosavedObjectCount(page)).toBe(1);

    // An ordinary reload: pagehide marks the exit clean.
    await page.reload();
    await settleBoot(page);

    // No blocking dialog — the prompt is a toast instead.
    await expect(page.getByRole('alertdialog')).toHaveCount(0);
    await expect(quietToast(page)).toBeVisible();
    // Nothing was restored behind the user's back.
    await expectObjects(page, 0);

    await quietToast(page).getByRole('button', { name: 'Restore', exact: true }).click();
    await expectObjects(page, 1);
    await expect(quietToast(page)).toHaveCount(0);
  });

  test('② crash: exit mark clean:false + unsaved entry ⇒ recovery modal (focus on Restore), Restore recovers', async ({ page }) => {
    await fastAutosave(page);
    await seedCrash(page);
    await page.goto('/');

    const dialog = page.getByRole('alertdialog', { name: 'Recover unsaved work?' });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText('Anchorworks did not shut down correctly last time.')).toBeVisible();
    // Object count and time are spelled out in the body.
    await expect(dialog.getByText('1 object', { exact: false })).toBeVisible();
    const restore = dialog.getByRole('button', { name: 'Restore', exact: true });
    await expect(restore).toBeFocused();

    await restore.click();
    await expectObjects(page, 1);
    await expect(dialog).toHaveCount(0);
  });

  test('③ empty document: no prompt at the next launch — and an old empty entry is dropped', async ({ page }) => {
    await fastAutosave(page);
    // Leftover from an older build, which snapshotted empty documents too.
    await page.addInitScript((key) => {
      const flag = '__recoveryEmptySeeded';
      if (window.localStorage.getItem(flag)) return;
      window.localStorage.setItem(flag, '1');
      window.localStorage.setItem(key, JSON.stringify({ json: { version: '7.4.0', objects: [] }, ts: Date.now() }));
    }, AUTOSAVE);
    await page.goto('/');
    await settleBoot(page); // decision + several empty autosave ticks

    await expect(page.getByRole('alertdialog')).toHaveCount(0);
    await expect(page.getByText(QUIET_TITLE)).toHaveCount(0);
    expect(await hasAutosave(page)).toBe(false);

    // …and the next launch of that empty session is just as quiet.
    await page.reload();
    await settleBoot(page);
    await expect(page.getByRole('alertdialog')).toHaveCount(0);
    await expect(page.getByText(QUIET_TITLE)).toHaveCount(0);
    expect(await hasAutosave(page)).toBe(false);
    await expectObjects(page, 0);

    await openFileMenu(page);
    await expect(page.getByRole('menuitem', { name: 'Restore Last Session…' })).toHaveCount(0);
  });

  test('④ recovery modal: Escape never discards; Discard needs a danger confirm', async ({ page }) => {
    await fastAutosave(page);
    await seedCrash(page);
    await page.goto('/');

    const dialog = page.getByRole('alertdialog', { name: 'Recover unsaved work?' });
    await expect(dialog).toBeVisible();

    // Escape: dialog stays, data stays, focus parked on the safe action.
    await page.keyboard.press('Escape');
    await expect(dialog).toBeVisible();
    expect(await hasAutosave(page)).toBe(true);
    await expect(dialog.getByRole('button', { name: 'Restore', exact: true })).toBeFocused();

    // Discard → confirm. Escape on the confirm cancels it: data stays.
    await dialog.getByRole('button', { name: 'Discard', exact: true }).click();
    const confirm = page.getByRole('alertdialog', { name: 'Discard recovered work?' });
    await expect(confirm).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(confirm).toHaveCount(0);
    expect(await hasAutosave(page)).toBe(true);
    await expect(dialog).toBeVisible();

    // Discard → confirm → really discard: only then is the entry gone.
    await dialog.getByRole('button', { name: 'Discard', exact: true }).click();
    await expect(confirm).toBeVisible();
    // The confirm must sit ON TOP of the recovery overlay to be clickable
    // (RecoveryDialog drops below ConfirmHost while the confirm is pending).
    await confirm.getByRole('button', { name: 'Discard', exact: true }).click();
    await expect(confirm).toHaveCount(0);
    await expect(dialog).toHaveCount(0);
    expect(await hasAutosave(page)).toBe(false);
    await expectObjects(page, 0);
  });

  test('⑤ File ▸ New: no restore prompt after the reload', async ({ page }) => {
    await fastAutosave(page);
    await page.goto('/');
    await drawOneRect(page);
    await expectObjects(page, 1);
    await expect.poll(() => autosavedObjectCount(page)).toBe(1);

    await openFileMenu(page);
    await page.locator('button[role="menuitem"][aria-label="New"]').last().click({ timeout: 5_000 });
    const newDoc = page.getByRole('alertdialog', { name: 'New document' });
    await expect(newDoc).toBeVisible({ timeout: 5_000 });
    await newDoc.getByRole('button', { name: 'Clear', exact: true }).click();

    await settleBoot(page);
    await expect(page.getByRole('alertdialog')).toHaveCount(0);
    await expect(page.getByText(QUIET_TITLE)).toHaveCount(0);
    expect(await hasAutosave(page)).toBe(false);
    await expectObjects(page, 0);
  });

  test('⑥ Ignore silences the prompt for that entry; File ▸ Restore Last Session… still brings it back', async ({ page }) => {
    await fastAutosave(page);
    await page.goto('/');
    await drawOneRect(page);
    await expectObjects(page, 1);
    await expect.poll(() => autosavedObjectCount(page)).toBe(1);

    await page.reload();
    await settleBoot(page);
    await expect(quietToast(page)).toBeVisible();

    await quietToast(page).getByRole('button', { name: 'Ignore', exact: true }).click();
    await expect(quietToast(page)).toHaveCount(0);
    // Ignoring hides the prompt — it does NOT delete the work.
    expect(await autosavedObjectCount(page)).toBe(1);

    // Next launch: no modal, no toast.
    await page.reload();
    await settleBoot(page);
    await expect(page.getByRole('alertdialog')).toHaveCount(0);
    await expect(page.getByText(QUIET_TITLE)).toHaveCount(0);

    // …but the manual route is still there.
    await openFileMenu(page);
    await page.getByRole('menuitem', { name: 'Restore Last Session…' }).click({ timeout: 5_000 });
    await expectObjects(page, 1);
  });

  test('⑦ a second window opened while the first is still running: quiet prompt, not a crash modal', async ({ page, context }) => {
    await fastAutosave(page);
    await page.goto('/');
    await drawOneRect(page);
    await expect.poll(() => autosavedObjectCount(page)).toBe(1);
    // This instance is alive: its exit mark is armed (clean:false) and it
    // holds the session lock.

    const second = await context.newPage();
    await second.addInitScript(() => {
      try { window.localStorage.setItem('vector.onboarded', 'true'); } catch { /* ignore */ }
    });
    await fastAutosave(second);
    await second.goto('/');
    await settleBoot(second);

    // The mark on disk really is the "not clean" one — only the live first
    // window tells it apart from a crash.
    const clean = await second.evaluate((key) => (JSON.parse(window.localStorage.getItem(key) || 'null') as { clean?: boolean } | null)?.clean, EXIT);
    expect(clean).toBe(false);
    await expect(second.getByRole('alertdialog')).toHaveCount(0);
    await expect(quietToast(second)).toBeVisible();
    await expectObjects(second, 0);
  });
});
