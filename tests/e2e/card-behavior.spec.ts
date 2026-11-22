import { test, expect, type Locator, type Page } from './fixtures';

// Card deep-behavior harness (2026-11 wave 4, implementer I-2).
//
// The dialog-fit spec proved every card OPENS and fits the viewport; this
// harness proves the in-card behaviour contracts across the remaining card
// surface (the C/D-level cards of the coverage matrix — the A-level flows
// already have dedicated specs). One data table drives a serial runner, one
// test per batch:
//
//   batch 1 — small effect cards (sliders + preset chips + Cancel/Reset/Apply)
//   batch 2 — structural cards (Transform/Repeat/Rhinestone/Plotter/…)
//   batch 3 — misc surfaces (Single-line Text, Variable Data, Shortcuts,
//             Error Log, About, Epson, Onboarding, AI Panel)
//
// Per-card assertion chain (data-driven, each step optional per card):
//   open (palette command or menubar item, on a 2-rect selection session)
//   → dialog visible by accessible name
//   → initial focus contract (autoFocus input / open-effect ref.focus)
//   → footer inventory (every action present in the expected enabled state)
//   → SAFE preset chip: aria-pressed moves + linked field takes the value
//   → footer Reset (where present): form fields regress to defaults
//   → close via the safe action (Cancel/Close) or Escape → dialog hidden
//   → menu-invoked cards: focus returns to the invoking menuitem
//   → StatusBar Objects counter unchanged (no Apply was ever clicked)
//   → zero console errors / pageerrors attributable to the card
//
// Safety rails (from the audit): no Apply/Create/Insert/Generate/Print/Send
// is ever clicked; TraceArt's Trace/Insert are pinned DISABLED without an
// image (negative contract); Plotter only touches Cancel; Epson/KeymapEditor
// close by Escape only; GangSheet never adds files; Variable Data never
// copies or generates.
//
// Palette-invoked cards assert no focus return: the palette unmounts its
// trigger on commit, so useFocusRestore's captured element is gone (the
// makesticker.spec.ts focus-return anchor is the menubar trigger — only
// menu-invoked cards can observe the contract, hence focusBack on those).

interface FieldSpec {
  /** Accessible name of the field (aria-label or wrapping <label> text). */
  name: string;
  /** Expected input value after the preset chip click (string compare). */
  value: string;
}

interface PresetSpec {
  /** role=toolbar accessible name that hosts the chips. */
  toolbar: string;
  /** CSS selector for the chip inside the toolbar (stable data-* hook). */
  chip: string;
  /** A second chip whose pressed state must flip to false (defaults none). */
  unpressed?: string;
  /** Field(s) that must track the chip (slider/spinbutton value). */
  fields?: FieldSpec[];
}

interface FooterButtonSpec {
  name: string;
  /** Expected disabled state — omitted means "must be enabled". */
  disabled?: boolean;
}

interface CardCase {
  /** Report/failure id. */
  id: string;
  /** Dialog accessible name (exact match on the h2/aria-label). */
  dialog: string;
  /** Open path: palette command label or [menubar menu, menu item]. */
  via: { palette?: string; menu?: readonly [string, string] };
  /** Initial focus contract inside the dialog, if the card has one. */
  focus?: { kind: 'spinbutton' | 'searchbox' | 'firstInput'; name?: string };
  /** Safe preset chip interaction. */
  preset?: PresetSpec;
  /** Footer inventory + close/reset actions. */
  footer?: {
    buttons: FooterButtonSpec[];
    /** Button name that closes the card safely (Cancel/Close). */
    closeBy?: string;
    /** Reset restores defaults: click + field/chip regression. */
    reset?: { fields?: FieldSpec[]; chipPressed?: string; chipUnpressed?: string };
  };
  /** How to close when no footer.closeBy: Escape (useEscapeClose). */
  closeByEscape?: boolean;
  /** Menu-invoked: assert focus returns to the invoking menuitem. */
  focusBack?: boolean;
  /** Card-specific extra steps (Onboarding nav, AI panel, …). */
  custom?: (page: Page, dialog: Locator) => Promise<string[]>;
}

// ---------------------------------------------------------------------------
// Shared plumbing (dialog-fit.spec.ts / makesticker.spec.ts patterns)
// ---------------------------------------------------------------------------

/** Two rects on the canvas, both selected — guarded palette entries pass,
 *  Blend… (needs ≥2 objects) opens, and dialogs grow with a selection. */
async function setupSession(page: Page) {
  await page.goto('/');
  await page.getByRole('menubar').waitFor({ state: 'visible', timeout: 20_000 });
  await page.waitForTimeout(600);
  const { width: vw, height: vh } = page.viewportSize()!;
  for (const [dx, dy] of [[-60, -40], [10, 10]] as const) {
    await page.click('button[data-tool="rect"]'); // drawing auto-switches tools — re-arm
    await page.mouse.move(vw / 2 + dx, vh / 2 + dy);
    await page.mouse.down();
    await page.mouse.move(vw / 2 + dx + 140, vh / 2 + dy + 70, { steps: 6 });
    await page.mouse.up();
  }
  await page.click('button[data-tool="select"]');
  await page.keyboard.press('Control+a');
  await page.waitForTimeout(300);
}

function countDialogs() {
  const vis = (el: Element) => {
    const s = getComputedStyle(el);
    return s.display !== 'none' && s.visibility !== 'hidden';
  };
  return [...document.querySelectorAll('[role="dialog"],[role="alertdialog"]')]
    .filter(vis)
    .filter((d) => !/command palette/i.test(d.getAttribute('aria-label') || '')).length;
}

async function closeAllDialogs(page: Page): Promise<boolean> {
  for (let i = 0; i < 4; i++) {
    if ((await page.evaluate(countDialogs)) === 0) return true;
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
  }
  return (await page.evaluate(countDialogs)) === 0;
}

/** Command-palette commit by exact option prefix (dialog-fit runner). */
async function runPaletteCommand(page: Page, label: string): Promise<boolean> {
  await page.keyboard.press('Control+K');
  const input = page.locator('input[placeholder="Type a command or search…"]');
  await input.waitFor({ state: 'visible', timeout: 10_000 });
  await input.fill(label);
  await page.waitForTimeout(300);
  const idx = await page.evaluate((l) => {
    const vis = (el: Element) => {
      const s = getComputedStyle(el);
      return s.visibility !== 'hidden' && s.display !== 'none';
    };
    const opts = [...document.querySelectorAll('#command-palette-list [role="option"]')]
      .filter(vis)
      .map((o) => (o.textContent || '').replace(/\s+/g, ' ').trim());
    return opts.findIndex((o) => o.startsWith(l));
  }, label);
  if (idx < 0) return false;
  for (let i = 0; i < idx; i++) await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(250);
  return true;
}

/** StatusBar Objects counter (makesticker.spec.ts anchor). */
function objectsLabel(page: Page) {
  return page.locator('[role="group"][aria-label="Editor status"] [aria-label^="Objects "]').first();
}

// ---------------------------------------------------------------------------
// The serial data-driven runner
// ---------------------------------------------------------------------------

async function expectField(dialog: Locator, spec: FieldSpec) {
  // Sliders (range), number inputs (spinbutton) and search/text inputs share
  // the value check; resolve by whichever role the field exposes.
  for (const role of ['slider', 'spinbutton', 'searchbox', 'textbox'] as const) {
    const byRole = dialog.getByRole(role, { name: spec.name, exact: true });
    if ((await byRole.count()) > 0) {
      await expect(byRole.first()).toHaveValue(spec.value);
      return;
    }
  }
  throw new Error(`no field named "${spec.name}" found in dialog`);
}

async function runCard(page: Page, consoleErrors: string[], card: CardCase): Promise<string[]> {
  const failures: string[] = [];
  const fail = (msg: string) => failures.push(`${card.id}: ${msg}`);
  const errStart = consoleErrors.length;
  const objectsBefore = await objectsLabel(page).getAttribute('aria-label');

  try {
    // --- open -------------------------------------------------------------
    let invokingMenuTrigger: Locator | null = null;
    if (card.via.palette) {
      const ran = await runPaletteCommand(page, card.via.palette);
      if (!ran) throw new Error(`palette command "${card.via.palette}" matched no option`);
    } else if (card.via.menu) {
      const [menu, item] = card.via.menu;
      invokingMenuTrigger = page.getByRole('menuitem', { name: menu, exact: true }).first();
      await invokingMenuTrigger.hover();
      await page.waitForTimeout(350);
      // CSS locator for the row: a role query stops matching it while the
      // open dialog steals focus-within visibility from its dropdown panel
      // (the row stays mounted — see confirm-behavior.spec).
      await page.locator(`button[role="menuitem"][aria-label="${item}"]`).last().click({ timeout: 5_000 });
    }

    const dialog = page.getByRole('dialog', { name: card.dialog, exact: true });
    await expect(dialog).toBeVisible({ timeout: 10_000 });
    await page.waitForTimeout(250); // open-transition settle

    // --- initial focus contract -------------------------------------------
    if (card.focus) {
      if (card.focus.kind === 'firstInput') {
        await expect(dialog.locator('input').first()).toBeFocused();
      } else if (card.focus.kind === 'searchbox') {
        await expect(dialog.getByRole('searchbox', { name: card.focus.name!, exact: true })).toBeFocused();
      } else {
        await expect(dialog.getByRole(card.focus.kind, { name: card.focus.name!, exact: true })).toBeFocused();
      }
    }

    // --- card-specific steps ----------------------------------------------
    if (card.custom) failures.push(...await card.custom(page, dialog));

    // --- footer inventory ---------------------------------------------------
    if (card.footer) {
      for (const b of card.footer.buttons) {
        const btn = dialog.getByRole('button', { name: b.name, exact: true }).first();
        await expect(btn).toBeVisible();
        if (b.disabled) await expect(btn).toBeDisabled();
        else await expect(btn).toBeEnabled();
      }
    }

    // --- safe preset chip: pressed state moves + fields track ---------------
    if (card.preset) {
      const toolbar = dialog.getByRole('toolbar', { name: card.preset.toolbar, exact: true });
      await expect(toolbar).toBeVisible();
      const chip = toolbar.locator(card.preset.chip);
      await expect(chip).toBeVisible();
      await chip.click();
      await expect(chip).toHaveAttribute('aria-pressed', 'true');
      if (card.preset.unpressed) {
        await expect(toolbar.locator(card.preset.unpressed)).toHaveAttribute('aria-pressed', 'false');
      }
      for (const field of card.preset.fields ?? []) await expectField(dialog, field);
    }

    // --- Reset regresses the form (never the canvas) -------------------------
    if (card.footer?.reset && card.footer.buttons.some((b) => b.name === 'Reset' && !b.disabled)) {
      await dialog.getByRole('button', { name: 'Reset', exact: true }).first().click();
      if (card.footer.reset.fields) {
        for (const field of card.footer.reset.fields) await expectField(dialog, field);
      }
      if (card.footer.reset.chipPressed) {
        const toolbar = dialog.getByRole('toolbar', { name: card.preset!.toolbar, exact: true });
        await expect(toolbar.locator(card.footer.reset.chipPressed)).toHaveAttribute('aria-pressed', 'true');
      }
      if (card.footer.reset.chipUnpressed) {
        const toolbar = dialog.getByRole('toolbar', { name: card.preset!.toolbar, exact: true });
        await expect(toolbar.locator(card.footer.reset.chipUnpressed)).toHaveAttribute('aria-pressed', 'false');
      }
    }

    // --- close ---------------------------------------------------------------
    if (card.footer?.closeBy) {
      await dialog.getByRole('button', { name: card.footer.closeBy, exact: true }).first().click();
    } else {
      await page.keyboard.press('Escape');
    }
    await expect(dialog).toBeHidden();
    await page.waitForTimeout(150);

    // --- focus return (menu-invoked cards only) -------------------------------
    // Wave-4 contract: focus returns to the menu TRIGGER, not the row — the
    // row's dropdown panel hides with focus-within once the dialog opens,
    // and restoring into its rows races :hover recomputation (drops to
    // <body>). restoreDialogFocus resolves menu rows to their owning
    // trigger; the trigger is the visible, deterministic landing spot.
    if (card.focusBack && invokingMenuTrigger) await expect(invokingMenuTrigger).toBeFocused();

    // --- canvas untouched ------------------------------------------------------
    const objectsAfter = await objectsLabel(page).getAttribute('aria-label');
    if (objectsBefore !== objectsAfter) {
      fail(`Objects counter changed across a no-apply session (${objectsBefore} → ${objectsAfter})`);
    }
  } catch (e) {
    // Keep the assertion diff lines (expected/received) — the first line
    // alone does not say which value mismatched.
    fail(e instanceof Error ? e.message.split('\n').slice(0, 5).join(' | ') : String(e));
  }

  const cardErrors = consoleErrors.slice(errStart);
  for (const err of cardErrors) fail(`console error: ${err.slice(0, 160)}`);

  // Never let one card poison the next.
  if (!(await closeAllDialogs(page))) await setupSession(page);
  return failures;
}

function attachErrorCapture(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));
  return errors;
}

// ---------------------------------------------------------------------------
// Batch 1 — 16 small effect cards
// ---------------------------------------------------------------------------

const BATCH1: CardCase[] = [
  {
    id: 'Hue', dialog: 'Adjust Hue', via: { palette: 'Adjust Hue…' },
    preset: { toolbar: 'Hue shift preset actions', chip: '[data-hue-preset="60"]', unpressed: '[data-hue-preset="0"]', fields: [{ name: 'Hue shift', value: '60' }] },
    footer: { buttons: [{ name: 'Cancel' }, { name: 'Reset' }, { name: 'Apply' }], closeBy: 'Cancel', reset: { fields: [{ name: 'Hue shift', value: '0' }], chipPressed: '[data-hue-preset="0"]' } },
  },
  {
    id: 'Saturate', dialog: 'Saturate', via: { palette: 'Saturate…' },
    preset: { toolbar: 'Saturation preset actions', chip: '[data-saturation-preset="50"]', unpressed: '[data-saturation-preset="0"]', fields: [{ name: 'Saturation', value: '50' }] },
    footer: { buttons: [{ name: 'Cancel' }, { name: 'Reset' }, { name: 'Apply' }], closeBy: 'Cancel', reset: { fields: [{ name: 'Saturation', value: '0' }], chipPressed: '[data-saturation-preset="0"]' } },
  },
  {
    id: 'Brightness', dialog: 'Adjust Brightness', via: { palette: 'Adjust Brightness…' },
    preset: { toolbar: 'Brightness preset actions', chip: '[data-brightness-preset="50"]', unpressed: '[data-brightness-preset="0"]', fields: [{ name: 'Brightness', value: '50' }] },
    footer: { buttons: [{ name: 'Cancel' }, { name: 'Reset' }, { name: 'Apply' }], closeBy: 'Cancel', reset: { fields: [{ name: 'Brightness', value: '0' }], chipPressed: '[data-brightness-preset="0"]' } },
  },
  {
    id: 'Pucker & Bloat', dialog: 'Pucker & Bloat', via: { palette: 'Pucker & Bloat…' },
    preset: { toolbar: 'Pucker / Bloat preset actions', chip: '[data-pucker-amount-preset="50"]', unpressed: '[data-pucker-amount-preset="0"]', fields: [{ name: 'Pucker & Bloat', value: '50' }] },
    footer: { buttons: [{ name: 'Cancel' }, { name: 'Reset' }, { name: 'Apply' }], closeBy: 'Cancel', reset: { fields: [{ name: 'Pucker & Bloat', value: '0' }], chipPressed: '[data-pucker-amount-preset="0"]' } },
  },
  {
    id: 'Twist', dialog: 'Twist', via: { palette: 'Twist…' },
    preset: { toolbar: 'Twist angle preset actions', chip: '[data-twist-angle-preset="90"]', unpressed: '[data-twist-angle-preset="45"]', fields: [{ name: 'Angle', value: '90' }] },
    // NB: Reset walks Twist back to 0°, not to its 45° open default.
    footer: { buttons: [{ name: 'Cancel' }, { name: 'Reset' }, { name: 'Apply' }], closeBy: 'Cancel', reset: { fields: [{ name: 'Angle', value: '0' }], chipPressed: '[data-twist-angle-preset="0"]' } },
  },
  {
    id: 'Roughen', dialog: 'Roughen', via: { palette: 'Roughen…' },
    preset: { toolbar: 'Roughen preset actions', chip: '[data-roughen-preset="distress"]', fields: [{ name: 'Size (mm)', value: '3' }, { name: 'Detail (mm)', value: '2' }] },
    footer: { buttons: [{ name: 'Cancel' }, { name: 'Reset' }, { name: 'Apply' }], closeBy: 'Cancel', reset: { fields: [{ name: 'Size (mm)', value: '1' }, { name: 'Detail (mm)', value: '3' }] } },
  },
  {
    id: 'Arc Warp', dialog: 'Arc Warp', via: { palette: 'Arc Warp…' },
    preset: { toolbar: 'Bend preset actions', chip: '[data-warp-bend-preset="25"]', fields: [{ name: 'Bend', value: '25' }] },
    footer: { buttons: [{ name: 'Cancel' }, { name: 'Reset' }, { name: 'Apply' }], closeBy: 'Cancel', reset: { fields: [{ name: 'Bend', value: '40' }] } },
  },
  {
    id: 'Zig Zag', dialog: 'Zig Zag', via: { palette: 'Zig Zag…' },
    preset: { toolbar: 'Zig Zag preset actions', chip: '[data-zigzag-preset="burst"]', fields: [{ name: 'Size (mm)', value: '3' }, { name: 'Ridges', value: '24' }] },
    footer: { buttons: [{ name: 'Cancel' }, { name: 'Apply' }], closeBy: 'Cancel' },
  },
  {
    id: 'Offset Path', dialog: 'Offset Path', via: { palette: 'Offset Path…' },
    preset: { toolbar: 'Offset preset actions', chip: '[data-offset="3"]', unpressed: '[data-offset="2"]', fields: [{ name: 'Offset (mm)', value: '3' }] },
    footer: { buttons: [{ name: 'Cancel' }, { name: 'Apply' }], closeBy: 'Cancel' },
  },
  {
    id: 'Round Corners', dialog: 'Round Corners', via: { palette: 'Round Corners…' },
    preset: { toolbar: 'Radius preset actions', chip: '[data-radius="5"]', unpressed: '[data-radius="3"]', fields: [{ name: 'Radius (mm)', value: '5' }] },
    footer: { buttons: [{ name: 'Cancel' }, { name: 'Apply' }], closeBy: 'Cancel' },
  },
  {
    id: 'Simplify Path', dialog: 'Simplify Path', via: { palette: 'Simplify Path…' },
    preset: { toolbar: 'Tolerance preset actions', chip: '[data-tolerance="3"]', unpressed: '[data-tolerance="1.5"]', fields: [{ name: 'Tolerance (px)', value: '3' }] },
    footer: { buttons: [{ name: 'Cancel' }, { name: 'Apply' }], closeBy: 'Cancel' },
  },
  {
    id: 'Resize', dialog: 'Resize', via: { palette: 'Resize…' },
    preset: { toolbar: 'Resize size recipe actions', chip: '[data-recipe="Name badge"]', fields: [{ name: 'Width (mm)', value: '89.0' }, { name: 'Height (mm)', value: '38.0' }] },
    footer: { buttons: [{ name: 'Cancel' }, { name: 'Reset' }, { name: 'Apply' }], closeBy: 'Cancel', reset: { chipUnpressed: '[data-recipe="Name badge"]' } },
  },
  {
    id: 'Shear', dialog: 'Shear', via: { palette: 'Shear…' },
    preset: { toolbar: 'Shear angle preset actions', chip: '[data-angle="-30"]', unpressed: '[data-angle="15"]', fields: [{ name: 'Shear angle', value: '-30' }] },
    footer: { buttons: [{ name: 'Cancel' }, { name: 'Reset' }, { name: 'Apply' }], closeBy: 'Cancel', reset: { fields: [{ name: 'Shear angle', value: '0' }], chipPressed: '[data-angle="0"]' } },
  },
  {
    id: 'Star / Polygon', dialog: 'Star / Polygon', via: { palette: 'Star / Polygon…' },
    preset: { toolbar: 'Shape preset actions', chip: '[data-star-preset-index="2"]', unpressed: '[data-star-preset-index="0"]', fields: [{ name: 'Sides', value: '3' }] },
    footer: { buttons: [{ name: 'Cancel' }, { name: 'Reset' }, { name: 'Insert' }], closeBy: 'Cancel', reset: { chipPressed: '[data-star-preset-index="0"]' } },
  },
  {
    id: 'Free Distort', dialog: 'Free Distort', via: { palette: 'Free Distort…' },
    preset: { toolbar: 'Free Distort preset actions', chip: '[data-free-distort-preset-index="2"]' },
    footer: { buttons: [{ name: 'Reset' }, { name: 'Cancel' }, { name: 'Apply' }], closeBy: 'Cancel', reset: { chipUnpressed: '[data-free-distort-preset-index="2"]' } },
  },
  {
    id: 'Multi-outline', dialog: 'Multi-outline', via: { palette: 'Multi-outline…' },
    preset: { toolbar: 'Outline preset actions', chip: '[data-outline-preset-index="1"]', unpressed: '[data-outline-preset-index="0"]', fields: [{ name: 'Outlines', value: '2' }] },
    footer: { buttons: [{ name: 'Cancel' }, { name: 'Apply' }], closeBy: 'Cancel' },
  },
];

test('batch 1 — small effect cards: open, focus-safe presets, footer, reset, cancel', async ({ page }) => {
  test.setTimeout(180_000);
  const consoleErrors = attachErrorCapture(page);
  await setupSession(page);
  const failures: string[] = [];
  for (const card of BATCH1) failures.push(...await runCard(page, consoleErrors, card));
  expect(failures, failures.join('\n')).toEqual([]);
});

// ---------------------------------------------------------------------------
// Batch 2 — 16 structural cards
// ---------------------------------------------------------------------------

const BATCH2: CardCase[] = [
  {
    id: 'Transform', dialog: 'Transform', via: { palette: 'Transform…' },
    preset: { toolbar: 'Transform scale preset actions', chip: '[data-value="150"]', unpressed: '[data-value="100"]' },
    footer: { buttons: [{ name: 'Cancel' }, { name: 'Reset' }, { name: 'Apply' }], closeBy: 'Cancel', reset: { chipPressed: '[data-value="100"]' } },
  },
  {
    id: 'Blend', dialog: 'Blend', via: { palette: 'Blend…' },
    preset: { toolbar: 'Blend step preset actions', chip: '[data-value="10"]', unpressed: '[data-value="5"]', fields: [{ name: 'Steps', value: '10' }] },
    footer: { buttons: [{ name: 'Cancel' }, { name: 'Reset' }, { name: 'Apply Options' }, { name: 'Apply' }], closeBy: 'Cancel' },
  },
  {
    id: 'Repeat', dialog: 'Repeat', via: { palette: 'Repeat (Grid / Radial / Mirror)…' },
    preset: { toolbar: 'Repeat grid preset actions', chip: '[data-value="five-across"]', unpressed: '[data-value="three-by-three"]' },
    footer: { buttons: [{ name: 'Cancel' }, { name: 'Reset' }, { name: 'Apply' }], closeBy: 'Cancel', reset: { chipPressed: '[data-value="three-by-three"]', chipUnpressed: '[data-value="five-across"]' } },
  },
  {
    id: 'Recolor Artwork', dialog: 'Recolor Artwork', via: { palette: 'Recolor Artwork…' },
    // Probed reality on a plain rect selection: Reset and Apply start
    // disabled (no swatch sources loaded) — pinned as the negative contract.
    footer: { buttons: [{ name: 'Reset', disabled: true }, { name: 'Cancel' }, { name: 'Apply', disabled: true }], closeBy: 'Cancel' },
  },
  {
    id: 'Split Into Grid', dialog: 'Split Into Grid', via: { palette: 'Split Into Grid…' },
    preset: { toolbar: 'Split grid preset actions', chip: '[data-rows="3"][data-cols="3"]', unpressed: '[data-rows="2"][data-cols="2"]', fields: [{ name: 'Rows', value: '3' }, { name: 'Columns', value: '3' }] },
    // Reset loads the canonical "Sticker sheet" recipe (3×3, gutter 2) —
    // not the 2×2/0mm open defaults.
    footer: { buttons: [{ name: 'Cancel' }, { name: 'Reset' }, { name: 'Apply' }], closeBy: 'Cancel', reset: { fields: [{ name: 'Rows', value: '3' }, { name: 'Columns', value: '3' }, { name: 'Gutter (mm)', value: '2' }] } },
  },
  {
    id: 'Rhinestone Template', dialog: 'Rhinestone Template', via: { palette: 'Rhinestone Template…' },
    preset: { toolbar: 'Rhinestone job preset actions', chip: '[title^="Fine stones"]', unpressed: '[title^="Standard stones"]' },
    footer: { buttons: [{ name: 'Cancel' }, { name: 'Reset' }, { name: 'Apply' }], closeBy: 'Cancel' },
  },
  {
    id: 'Banner Grommets', dialog: 'Banner Grommets', via: { palette: 'Banner Grommets…' },
    preset: { toolbar: 'Banner preset actions', chip: '[title^="Small banner"]', unpressed: '[title^="Standard banner"]', fields: [{ name: 'Inset (mm)', value: '15' }] },
    footer: { buttons: [{ name: 'Cancel' }, { name: 'Reset' }, { name: 'Apply' }], closeBy: 'Cancel', reset: { fields: [{ name: 'Inset (mm)', value: '20' }], chipPressed: '[title^="Standard banner"]' } },
  },
  {
    id: 'Margin Guides', dialog: 'Margin Guides', via: { palette: 'Margin Guides…' },
    focus: { kind: 'spinbutton', name: 'Margin (mm)' },
    preset: { toolbar: 'Margin preset actions', chip: '[data-margin="25"]', unpressed: '[data-margin="10"]', fields: [{ name: 'Margin (mm)', value: '25' }] },
    // Reset loads the canonical "Sticker safe" recipe (5mm), not the 10mm
    // "Office print" open default.
    footer: { buttons: [{ name: 'Cancel' }, { name: 'Reset' }, { name: 'Apply' }], closeBy: 'Cancel', reset: { fields: [{ name: 'Margin (mm)', value: '5' }], chipPressed: '[data-margin="5"]' } },
  },
  {
    id: 'Freeform Gradient', dialog: 'Freeform Gradient', via: { palette: 'Freeform Gradient…' },
    preset: { toolbar: 'Freeform Gradient preset actions', chip: '[data-freeform-gradient-preset-index="1"]' },
    footer: { buttons: [{ name: 'Cancel' }, { name: 'Create' }], closeBy: 'Cancel' },
  },
  {
    id: 'Cut Contour', dialog: 'Cut Contour', via: { palette: 'Cut Contour…' },
    preset: { toolbar: 'Contour preset actions', chip: '[title^="Wide decal"]', unpressed: '[title^="Sticker bleed"]' },
    footer: { buttons: [{ name: 'Close' }, { name: 'Send to Plotter…', disabled: true }], closeBy: 'Close' },
  },
  {
    id: 'Document Settings', dialog: 'Document Settings', via: { palette: 'Document Settings…' },
    // The orientation chips are deliberately NOT driven: clicking Landscape
    // proved non-deterministic in a long session (wrong pressed pair once,
    // a hard page freeze once — both unreproducible in isolation). That
    // instability is reported as a wave-4 src finding; coverage here stays
    // on the deterministic contracts: footer inventory + safe Cancel.
    footer: { buttons: [{ name: 'Cancel' }, { name: 'Reset' }, { name: 'Apply' }], closeBy: 'Cancel' },
  },
  {
    id: 'Tile Print', dialog: 'Tile Print…', via: { palette: 'Tile Print…' },
    preset: { toolbar: 'Tile grid preset actions', chip: '[data-value="3x3"]', unpressed: '[data-value="2x2"]' },
    // Reset walks the form back to the proof default (1×1 grid), not the
    // 2×2 open default.
    footer: { buttons: [{ name: 'Cancel' }, { name: 'Reset' }, { name: 'Print' }], closeBy: 'Cancel', reset: { chipPressed: '[data-value="1x1"]' } },
  },
  {
    id: 'Gang Sheet Builder', dialog: 'Gang Sheet Builder', via: { palette: 'Gang Sheet Builder…' },
    footer: { buttons: [{ name: 'Close' }, { name: 'Export PNG', disabled: true }, { name: 'Build', disabled: true }], closeBy: 'Close' },
  },
  {
    id: 'Trace to Vector Art', dialog: 'Trace to Vector Art', via: { palette: 'Trace to Vector Art…' },
    preset: { toolbar: 'Detail', chip: 'button:has-text("Fine")', unpressed: 'button:has-text("Medium")' },
    footer: { buttons: [{ name: 'Close' }, { name: 'Trace', disabled: true }, { name: 'Insert as artwork', disabled: true }], closeBy: 'Close' },
  },
  {
    id: 'Separations', dialog: 'Separations', via: { palette: 'Separations…' },
    footer: { buttons: [{ name: 'Close' }, { name: 'Export Plate' }, { name: 'Export All Plates' }], closeBy: 'Close' },
    custom: async (_page, dialog) => {
      const failures: string[] = [];
      const group = dialog.getByRole('toolbar', { name: 'Separations export format', exact: true });
      const svg = group.getByRole('button', { name: 'SVG', exact: true });
      const png = group.getByRole('button', { name: 'PNG', exact: true });
      try {
        await expect(svg).toHaveAttribute('aria-pressed', 'true');
        await png.click();
        await expect(png).toHaveAttribute('aria-pressed', 'true');
        await expect(svg).toHaveAttribute('aria-pressed', 'false');
      } catch (e) {
        failures.push(`Separations: ${e instanceof Error ? e.message.split('\n')[0] : String(e)}`);
      }
      return failures;
    },
  },
  {
    id: 'Send to Plotter', dialog: 'Send to Plotter / Cutter', via: { palette: 'Send to Plotter…' },
    // High-risk card: Cancel remains the ONLY touched action. The 2026-11
    // reorg split the flat 17-input form into Machine / Cut / Output tabs —
    // the custom step proves the tablist lands on Machine (nothing
    // connected) and switches panes; no output/send control is touched.
    custom: async (_page, dialog) => {
      const failures: string[] = [];
      try {
        const tabs = dialog.getByRole('tablist', { name: 'Plotter sections' });
        const machine = tabs.getByRole('tab', { name: 'Machine', exact: true });
        const cut = tabs.getByRole('tab', { name: 'Cut settings', exact: true });
        const output = tabs.getByRole('tab', { name: 'Output', exact: true });
        await expect(machine).toHaveAttribute('aria-selected', 'true');
        await cut.click();
        await expect(cut).toHaveAttribute('aria-selected', 'true');
        await expect(dialog.locator('[data-plotter-pane="cut"]')).toBeVisible();
        await output.click();
        await expect(output).toHaveAttribute('aria-selected', 'true');
        await expect(dialog.locator('[data-plotter-pane="output"]')).toBeVisible();
        await machine.click();
        await expect(machine).toHaveAttribute('aria-selected', 'true');
      } catch (e) {
        failures.push(`Plotter tabs: ${e instanceof Error ? e.message.split('\n')[0] : String(e)}`);
      }
      return failures;
    },
    footer: { buttons: [{ name: 'Cancel' }], closeBy: 'Cancel' },
  },
];

test('batch 2 — structural cards: open, safe presets, footer, reset, cancel', async ({ page }) => {
  test.setTimeout(180_000);
  const consoleErrors = attachErrorCapture(page);
  await setupSession(page);
  const failures: string[] = [];
  for (const card of BATCH2) failures.push(...await runCard(page, consoleErrors, card));
  expect(failures, failures.join('\n')).toEqual([]);
});

// ---------------------------------------------------------------------------
// Batch 3 — misc surfaces
// ---------------------------------------------------------------------------

const BATCH3: CardCase[] = [
  {
    id: 'Single-line Text', dialog: 'Single-line Text', via: { palette: 'Single-line Text…' },
    focus: { kind: 'firstInput' },
    preset: { toolbar: 'Single-line Text preset actions', chip: '[title^="Badge:"]' },
    footer: { buttons: [{ name: 'Cancel' }, { name: 'Create' }], closeBy: 'Cancel' },
  },
  {
    id: 'Variable Data', dialog: 'Variable Data', via: { palette: 'Variable Data…' },
    preset: { toolbar: 'Variable Data serial presets', chip: '[data-variable-data-preset="badges-10"]' },
    // Escape-close contract (useEscapeClose) is the coverage gap this
    // harness closes for Variable Data — Cancel presence is asserted but
    // never clicked; never Copy, never Generate.
    footer: { buttons: [{ name: 'Cancel' }, { name: 'Generate' }] },
    closeByEscape: true,
  },
  {
    id: 'Customize Shortcuts (KeymapEditor)', dialog: 'Customize Shortcuts…', via: { palette: 'Customize Shortcuts…' },
    focus: { kind: 'searchbox', name: 'Search shortcuts…' },
    // Reset All is deliberately NOT clicked (destructive to user keymap).
    closeByEscape: true,
    custom: async (_page, dialog) => {
      const failures: string[] = [];
      try {
        const resetAll = dialog.getByRole('button', { name: 'Reset All', exact: true });
        await expect(resetAll).toBeVisible();
        await expect(resetAll).toBeEnabled();
      } catch (e) {
        failures.push(`KeymapEditor Reset All inventory: ${e instanceof Error ? e.message.split('\n')[0] : String(e)}`);
      }
      return failures;
    },
  },
  {
    id: 'Keyboard Shortcuts', dialog: 'Keyboard Shortcuts', via: { palette: 'Keyboard Shortcuts' },
    focus: { kind: 'searchbox', name: 'Search shortcuts…' },
    footer: { buttons: [{ name: 'Close' }, { name: 'Customize Shortcuts…' }], closeBy: 'Close' },
    preset: {
      toolbar: 'Shortcut search recipe actions',
      chip: 'button:has-text("Text keys")', unpressed: 'button:has-text("Edit keys")',
      fields: [{ name: 'Search shortcuts…', value: 'text' }],
    },
  },
  {
    id: 'Error Log', dialog: 'Error Log', via: { menu: ['Help', 'Error Log…'] },
    // Empty-log contract: Copy all / Clear / Download start disabled, and
    // the open-effect falls back to focusing the always-enabled Close
    // (wave-4 fix — it previously targeted the disabled Copy-all, and the
    // browser silently refuses to focus disabled controls).
    closeByEscape: true,
    focusBack: true,
    custom: async (_page, dialog) => {
      const failures: string[] = [];
      try {
        await expect(dialog.getByRole('button', { name: 'Copy all', exact: true })).toBeDisabled();
        await expect(dialog.getByRole('button', { name: 'Close', exact: true }).first()).toBeEnabled();
        await expect(dialog.getByRole('button', { name: 'Close', exact: true }).first()).toBeFocused();
      } catch (e) {
        failures.push(`ErrorLog empty-log buttons/focus: ${e instanceof Error ? e.message.split('\n')[0] : String(e)}`);
      }
      return failures;
    },
  },
  {
    id: 'About', dialog: 'About', via: { menu: ['Help', 'About'] },
    closeByEscape: true, // MenuBar wires useEscapeClose for the About dialog
    focusBack: true,
    custom: async (_page, dialog) => {
      const failures: string[] = [];
      try {
        await expect(dialog.getByText(/Version/)).toBeVisible();
      } catch (e) {
        failures.push(`About version line: ${e instanceof Error ? e.message.split('\n')[0] : String(e)}`);
      }
      return failures;
    },
  },
  {
    id: 'Epson maintenance', dialog: 'Epson maintenance', via: { menu: ['Production', 'Epson maintenance…'] },
    // Escape-only close; every transport command button stays untouched.
    closeByEscape: true,
    focusBack: true,
    custom: async (_page, dialog) => {
      const failures: string[] = [];
      try {
        await expect(dialog.getByRole('combobox', { name: 'Printer', exact: true })).toBeVisible();
        await expect(dialog.getByRole('textbox', { name: 'Serial number', exact: true })).toBeVisible();
      } catch (e) {
        failures.push(`Epson fields: ${e instanceof Error ? e.message.split('\n')[0] : String(e)}`);
      }
      return failures;
    },
  },
  {
    id: 'Onboarding', dialog: 'Getting Started', via: { palette: 'Onboarding…' },
    custom: async (page, dialog) => {
      // Safe navigation: Next → slide 2 (Back enables, dot 2 current),
      // Back → slide 1 (Back disables again). Never finishes the tour.
      const failures: string[] = [];
      try {
        const actions = dialog.getByRole('toolbar', { name: 'Onboarding actions', exact: true });
        const next = actions.getByRole('button', { name: 'Next', exact: true });
        const back = actions.getByRole('button', { name: 'Back', exact: true });
        const dots = dialog.getByRole('toolbar', { name: 'Onboarding slides', exact: true });
        await expect(back).toBeDisabled();
        await next.click();
        await expect(back).toBeEnabled();
        await expect(dots.getByRole('button', { name: 'Slide 2 of 4', exact: true })).toHaveAttribute('aria-current', 'step');
        await back.click();
        await expect(back).toBeDisabled();
        await expect(dots.getByRole('button', { name: 'Slide 1 of 4', exact: true })).toHaveAttribute('aria-current', 'step');
      } catch (e) {
        failures.push(`Onboarding nav: ${e instanceof Error ? e.message.split('\n')[0] : String(e)}`);
      }
      return failures;
    },
    // Onboarding has no useEscapeClose — close through the header × control.
    footer: { buttons: [], closeBy: 'Close' },
  },
  {
    id: 'AI Panel', dialog: 'AI Configuration', via: { palette: 'Open AI Panel' },
    // Fresh profile → no API key → the panel mounts with its AI
    // Configuration modal already open. Cancel the modal, then close the
    // panel itself. The AI prompt transport is never used.
    custom: async (page, dialog) => {
      const failures: string[] = [];
      try {
        await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
        await expect(dialog).toBeHidden();
        const panel = page.getByRole('heading', { name: 'AI Assistant', exact: true });
        await expect(panel).toBeVisible();
        await page.getByRole('toolbar', { name: 'AI panel actions', exact: true })
          .getByRole('button', { name: 'Close', exact: true }).click();
        await expect(panel).toBeHidden();
      } catch (e) {
        failures.push(`AI Panel flow: ${e instanceof Error ? e.message.split('\n')[0] : String(e)}`);
      }
      return failures;
    },
  },
];

test('batch 3 — misc surfaces: focus contracts, safe navigation, escape closes', async ({ page }) => {
  test.setTimeout(180_000);
  const consoleErrors = attachErrorCapture(page);
  await setupSession(page);
  const failures: string[] = [];
  for (const card of BATCH3) failures.push(...await runCard(page, consoleErrors, card));
  expect(failures, failures.join('\n')).toEqual([]);
});
