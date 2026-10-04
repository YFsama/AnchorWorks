import { test, expect, type Locator, type Page } from './fixtures';

// PrintDialog e2e regression net (P2-2) — the dialog
// (src/components/PrintDialog.tsx, 664 lines) previously had zero e2e
// coverage. These specs drive the UI flow ONLY: the Print and PDF footer
// actions are asserted to exist but never clicked, so nothing ever reaches
// the OS print pipeline or a file save. Coverage:
//   - the top-bar "Print…" button (MenuBar's "Output actions" cluster) opens
//     the dialog with its defaults mirrored in aria state (Proof job preset,
//     A4 listbox option, portrait orientation) and the WYSIWYG preview
//     present (PrintPreview renders role="img" aria-label="Print preview" —
//     presence only, never pixel-asserted)
//   - orientation / page-size changes flow through aria-pressed /
//     aria-selected into the visible "Ready to print:" summary line
//   - the "Photo fill" job preset rewrites every option at once, the margin
//     preset chips and the margin spinbutton stay in sync, and Reset
//     restores the defaults
//   - Ctrl+P ("file.print" default binding, src/lib/keymap.ts, handled in
//     App.tsx) opens the dialog, and the top-bar "Print Prep…" entry opens
//     the SAME dialog with the Print Prep section pre-expanded (the
//     openPrintPrep handshake) where the Press prep preset drives the mark
//     checkboxes and bleed field
//   - Escape and the Cancel button close without printing
//
// Anchor notes (mirroring how the dialog really computes names):
//   - several preset labels are shortened by i18n enOverrides ("Proof print"
//     → "Proof", "Press prep" → "Press", "No prep" → "None"), so the chips
//     are matched by their display names.
//   - the FIRST button of each Field-wrapped segment group (Portrait,
//     "Actual size") inherits a label-derived accessible name instead of its
//     own text, so those two are never name-matched: portrait state is read
//     through the Landscape button's aria-pressed and the summary line, and
//     switching back to portrait rides the segment group's ArrowLeft roving.
//   - the top-bar buttons use exact matching — plain substring matching
//     would also hit "Tile Print…".

/** The top-bar Output cluster that owns the Print… / Print Prep… buttons. */
function outputToolbar(page: Page): Locator {
  return page.getByRole('toolbar', { name: 'Output actions' });
}

/** The dialog root — aria-labelledby points at the "Print" h2. `exact`
 *  keeps it distinct from longer "Print …"-style labels. */
function printDialog(page: Page): Locator {
  return page.getByRole('dialog', { name: 'Print', exact: true });
}

async function openPrintDialog(page: Page): Promise<Locator> {
  await outputToolbar(page).getByRole('button', { name: 'Print…', exact: true }).click();
  const dialog = printDialog(page);
  await expect(dialog).toBeVisible({ timeout: 10_000 });
  return dialog;
}

// Intent: opening from the top bar lands on a fully-formed dialog — the
// initial options equal the "Proof print" job preset (A4 · portrait · fit ·
// 10mm margin, see PRINT_JOB_PRESETS), each control mirrors that in aria
// state, and the preview pane exists. Escape (useEscapeClose) closes it.
// Anchors: Output actions toolbar by name, dialog by name, job-preset
// toolbar chip + aria-pressed, Landscape button's aria-pressed (false =
// portrait active), Page size listbox's aria-selected option, preview img
// by role/name, summary substring.
test('Print… opens the dialog with default options and a preview; Escape closes', async ({ page }) => {
  await page.goto('/');
  // Wait for the chrome so the click can't race the boot splash.
  await expect(page.getByRole('toolbar', { name: 'Tools' })).toBeVisible();

  const dialog = await openPrintDialog(page);

  // Default job options equal the "Proof print" preset exactly (display
  // name "Proof" via enOverrides).
  const jobPresets = dialog.getByRole('toolbar', { name: 'Print job preset actions' });
  await expect(jobPresets.getByRole('button', { name: 'Proof' })).toHaveAttribute('aria-pressed', 'true');

  // Portrait is the default orientation — read via Landscape's unpressed
  // state plus the summary (the Portrait button itself is label-named).
  const orientation = dialog.getByRole('group', { name: 'Orientation' });
  await expect(orientation.getByRole('button', { name: 'Landscape' })).toHaveAttribute('aria-pressed', 'false');

  // All four page sizes render with A4 (the default) selected.
  const sizes = dialog.getByRole('listbox', { name: 'Page size' });
  await expect(sizes.getByRole('option')).toHaveCount(4);
  await expect(sizes.getByRole('option', { name: /^A4/ })).toHaveAttribute('aria-selected', 'true');

  // The WYSIWYG preview pane exists (its contents are not asserted).
  await expect(dialog.getByRole('img', { name: 'Print preview' })).toBeVisible();

  // The visible summary line reflects the defaults. Matched as a full
  // string: the job-preset live region echoes the same summary behind a
  // "Reviewing " prefix, so substring regexes would hit both nodes.
  await expect(dialog.getByText('A4 210×297mm · Portrait · Fit to page · Margin 10mm · None', { exact: true })).toBeVisible();

  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
});

// Intent: changing the key options is observable in three places at once —
// the control's own aria state, the page-size listbox's aria-selected, and
// the "Ready to print:" summary whose dimensions swap with orientation
// (A4 portrait 210×297mm → landscape 297×210mm, A3 landscape 420×297mm per
// PAGE_DIMS_MM). ArrowRight on the listbox roves selection onto the next
// size. Cancel (footer) closes without invoking any output action.
// Anchors: Landscape button by name + aria-pressed, listbox options by name
// prefix + aria-selected + focus, summary by its unique i18n substring,
// footer toolbar by name.
test('orientation and page-size changes follow aria state and the summary; Cancel closes', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('toolbar', { name: 'Tools' })).toBeVisible();
  const dialog = await openPrintDialog(page);

  const orientation = dialog.getByRole('group', { name: 'Orientation' });
  await orientation.getByRole('button', { name: 'Landscape' }).click();
  await expect(orientation.getByRole('button', { name: 'Landscape' })).toHaveAttribute('aria-pressed', 'true');
  // Landscape swaps the summary dimensions and orientation label (full
  // string — see the live-region note in the first test).
  await expect(dialog.getByText('A4 297×210mm · Landscape · Fit to page · Margin 10mm · None', { exact: true })).toBeVisible();

  const sizes = dialog.getByRole('listbox', { name: 'Page size' });
  await sizes.getByRole('option', { name: /^A3/ }).click();
  await expect(sizes.getByRole('option', { name: /^A3/ })).toHaveAttribute('aria-selected', 'true');
  await expect(sizes.getByRole('option', { name: /^A4/ })).toHaveAttribute('aria-selected', 'false');
  await expect(dialog.getByText('A3 420×297mm · Landscape · Fit to page · Margin 10mm · None', { exact: true })).toBeVisible();

  // ArrowRight roves the option list: A3 → Letter, and the selection (not
  // just focus) follows — handlePageSizeKeys applies the reviewed size.
  await page.keyboard.press('ArrowRight');
  await expect(sizes.getByRole('option', { name: /^Letter/ })).toBeFocused();
  await expect(sizes.getByRole('option', { name: /^Letter/ })).toHaveAttribute('aria-selected', 'true');

  // Cancel closes the dialog without printing.
  await dialog.getByRole('toolbar', { name: 'Print output actions' }).getByRole('button', { name: 'Cancel' }).click();
  await expect(dialog).toBeHidden();
});

// Intent: a print-job preset is a one-click bundle — "Photo fill" (A4 ·
// landscape · fill · 0mm) must flip the orientation and scaling segments,
// zero the margin spinbutton, and move its own aria-pressed. The margin
// preset chips and the margin number input are two views of one state, and
// Reset walks every control back to the "Proof print" defaults (portrait
// read via Landscape's unpressed state again).
// Anchors: job-preset toolbar + segment groups by name, aria-pressed per
// button, spinbutton by its label-derived name substring, summary substring.
test('Photo fill job preset rewrites all options; margin chips sync; Reset restores defaults', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('toolbar', { name: 'Tools' })).toBeVisible();
  const dialog = await openPrintDialog(page);

  const jobPresets = dialog.getByRole('toolbar', { name: 'Print job preset actions' });
  await jobPresets.getByRole('button', { name: 'Photo fill' }).click();

  await expect(jobPresets.getByRole('button', { name: 'Photo fill' })).toHaveAttribute('aria-pressed', 'true');
  await expect(jobPresets.getByRole('button', { name: 'Proof' })).toHaveAttribute('aria-pressed', 'false');

  // The preset carried orientation, scaling and margin with it.
  const orientation = dialog.getByRole('group', { name: 'Orientation' });
  await expect(orientation.getByRole('button', { name: 'Landscape' })).toHaveAttribute('aria-pressed', 'true');
  await expect(dialog.getByRole('group', { name: 'Scaling' }).getByRole('button', { name: 'Fill page' })).toHaveAttribute('aria-pressed', 'true');
  const margin = dialog.getByRole('spinbutton', { name: 'Margin (mm)' });
  await expect(margin).toHaveValue('0');
  await expect(dialog.getByText(/Margin 0mm/)).toBeVisible();

  // Margin preset chips and the spinbutton stay in sync.
  const marginPresets = dialog.getByRole('group', { name: 'Margin presets' });
  await marginPresets.getByRole('button', { name: '25', exact: true }).click();
  await expect(margin).toHaveValue('25');
  await expect(marginPresets.getByRole('button', { name: '25', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(dialog.getByText(/Margin 25mm/)).toBeVisible();

  // Reset restores every default at once.
  await dialog.getByRole('toolbar', { name: 'Print output actions' }).getByRole('button', { name: 'Reset' }).click();
  await expect(jobPresets.getByRole('button', { name: 'Proof' })).toHaveAttribute('aria-pressed', 'true');
  await expect(orientation.getByRole('button', { name: 'Landscape' })).toHaveAttribute('aria-pressed', 'false');
  await expect(dialog.getByRole('listbox', { name: 'Page size' }).getByRole('option', { name: /^A4/ })).toHaveAttribute('aria-selected', 'true');
  await expect(margin).toHaveValue('10');
});

// Intent: the keyboard binding works without any button (App.tsx's
// match('file.print') branch), and the top-bar "Print Prep…" entry opens the
// SAME dialog with the Print Prep section pre-expanded (openPrintPrep sets
// showPrint + openPrintPrep; PrintDialog consumes the flag on mount). In the
// expanded section the "Press prep" preset (3mm bleed + all marks) drives
// the mark checkboxes, the bleed field, and the summary line.
// Anchors: aria-expanded on the disclosure button, Print Prep presets group,
// checkboxes by their label-derived names, Bleed spinbutton, summary.
test('Ctrl+P opens the dialog; Print Prep… opens it with the prep section expanded', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('toolbar', { name: 'Tools' })).toBeVisible();

  // The "file.print" binding — no button click involved.
  await page.keyboard.press('Control+p');
  const dialog = printDialog(page);
  await expect(dialog).toBeVisible({ timeout: 10_000 });
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();

  await outputToolbar(page).getByRole('button', { name: 'Print Prep…', exact: true }).click();
  await expect(dialog).toBeVisible();

  // The prep disclosure starts expanded via this entry point.
  const prepToggle = dialog.getByRole('button', { name: 'Print Prep', exact: true });
  await expect(prepToggle).toHaveAttribute('aria-expanded', 'true');

  // Prep defaults (defaultPrintPrep): nothing active → the "None" preset
  // (display name of "No prep" via enOverrides).
  const prepPresets = dialog.getByRole('group', { name: 'Print Prep presets' });
  await expect(prepPresets.getByRole('button', { name: 'None' })).toHaveAttribute('aria-pressed', 'true');
  const cropMarks = dialog.getByRole('checkbox', { name: 'Crop marks' });
  await expect(cropMarks).not.toBeChecked();

  // "Press prep": 3mm bleed + crop + registration + page info.
  await prepPresets.getByRole('button', { name: 'Press' }).click();
  await expect(prepPresets.getByRole('button', { name: 'Press' })).toHaveAttribute('aria-pressed', 'true');
  await expect(cropMarks).toBeChecked();
  await expect(dialog.getByRole('checkbox', { name: 'Registration marks' })).toBeChecked();
  await expect(dialog.getByRole('checkbox', { name: 'Page info' })).toBeChecked();
  await expect(dialog.getByRole('spinbutton', { name: 'Bleed (mm)' })).toHaveValue('3');
  // The summary line picks up the active prep (full string — the job-preset
  // live region echoes the summary behind a "Reviewing " prefix).
  await expect(dialog.getByText('A4 210×297mm · Portrait · Fit to page · Margin 10mm · Bleed 3mm · Crop marks · Registration marks · Page info', { exact: true })).toBeVisible();

  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
});
