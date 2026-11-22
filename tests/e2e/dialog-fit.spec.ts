import { test, expect, type Page } from './fixtures';

// Dialog viewport-fit regression (2026-11 wave 3b).
//
// Before this guard, modal cards had no height constraint: tall dialogs
// (Plotter at 1472px) overflowed the window on both sides and their footer
// actions (Send via USB / Print / Apply) were unreachable at common sizes.
// The fix gives every card `max-h-[calc(100vh-4rem)]` (structural
// header/scroll-body/footer for the big ones) and the menubar dropdown
// panels `max-h-[calc(100vh-6rem)]`.
//
// This spec drives the real app like the audit probe did: one shape on the
// canvas and selected (several dialogs grow with a selection), then every
// dialog opened via the command palette (plus the three menu-only ones),
// measured against two viewports — the desktop-minimum 960×600 and a small
// laptop 1366×768. Pass = card fully inside the viewport AND the last
// action button visible and hit-test clickable on first paint (no
// scrolling to reach Cancel/Apply). Menubar panels only need to fit
// vertically (they're anchored to their trigger).

type Measurement = {
  opened: boolean;
  topOverflow?: number;
  bottomOverflow?: number;
  leftOverflow?: number;
  rightOverflow?: number;
  footer?: { label: string; ok: boolean } | null;
  dismissal?: { label: string; ok: boolean } | null;
};

const VIEWPORTS = [
  { name: '960x600', width: 960, height: 600 },
  { name: '1366x768', width: 1366, height: 768 },
] as const;

/** Command-palette labels that open a modal (exact option prefix match). */
const CP_DIALOGS = [
  'Document Settings…', 'Open Preferences…', 'Open Help Center', 'Keyboard Shortcuts',
  'Customize Shortcuts…', 'Onboarding…', 'Print…', 'Print Prep…', 'Separations…',
  'Tile Print…', 'Gang Sheet Builder…', 'Make Sticker…', 'Trace to Vector Art…',
  'Surface Wrap…', 'Send to Plotter…', 'Transform…', 'Resize…', 'Blend…',
  'Adjust Hue…', 'Saturate…', 'Adjust Brightness…', 'Repeat (Grid / Radial / Mirror)…',
  'Arc Warp…', 'Recolor Artwork…', 'Variable Data…', 'Rhinestone Template…',
  'Find & Replace…', 'Banner Grommets…', 'Production Preview…', 'Simplify Path…',
  'Round Corners…', 'Offset Path…', 'Split Into Grid…', 'Roughen…', 'Pucker & Bloat…',
  'Twist…', 'Free Distort…', 'Star / Polygon…', 'Cut Contour…', 'Freeform Gradient…',
  'Margin Guides…', 'Single-line Text…', 'Shear…', 'Open AI Panel',
  // D-level entries that had zero dialog-fit coverage (wave 4): both are
  // palette commands ('path.zigzag' and 'effect.outline' in
  // CommandPalette.tsx) and previously escaped this list.
  'Zig Zag…', 'Multi-outline…',
];

/** Dialogs without a palette entry, opened through their menubar menu. */
const MENU_DIALOGS: ReadonlyArray<readonly [menu: string, item: string, name: string]> = [
  ['Help', 'Error Log…', 'Error Log'],
  ['Help', 'About', 'About'],
  ['Production', 'Epson maintenance…', 'Epson maintenance'],
];

const MENUS = ['File', 'Edit', 'Object', 'Type', 'Effects', 'Production', 'View', 'Insert', 'Help'];

/** Two rects on the canvas, both selected — dialogs grow with a selection,
 *  and Blend… refuses to open without exactly two objects. */
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

async function closeAllDialogs(page: Page): Promise<boolean> {
  for (let i = 0; i < 4; i++) {
    if ((await page.evaluate(countDialogs)) === 0) return true;
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
  }
  return (await page.evaluate(countDialogs)) === 0;
}

function countDialogs() {
  const vis = (el: Element) => {
    const s = getComputedStyle(el);
    return s.display !== 'none' && s.visibility !== 'hidden';
  };
  return [...document.querySelectorAll('[role="dialog"]')]
    .filter(vis)
    .filter((d) => !/command palette/i.test(d.getAttribute('aria-label') || '')).length;
}

/** Largest rounded card inside the topmost visible dialog, plus footer hit-test. */
function measureDialog(): Measurement {
  // Playwright's actionability auto-scroll can offset #root (its content
  // overflows); real users start unscrolled, so normalise before measuring.
  document.getElementById('root')?.scrollTo(0, 0);
  window.scrollTo(0, 0);
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const vis = (el: Element) => {
    const s = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    return s.display !== 'none' && s.visibility !== 'hidden' && r.width > 0 && r.height > 0;
  };
  const dialogs = [...document.querySelectorAll('[role="dialog"]')]
    .filter(vis)
    .filter((d) => !/command palette/i.test(d.getAttribute('aria-label') || ''));
  if (!dialogs.length) return { opened: false };
  const dlg = dialogs[dialogs.length - 1];
  let card: HTMLElement = dlg as HTMLElement;
  let best = 0;
  for (const el of [dlg, ...dlg.querySelectorAll<HTMLElement>('*')]) {
    const cls = typeof el.className === 'string' ? el.className : '';
    if (!/rounded/.test(cls)) continue;
    const r = el.getBoundingClientRect();
    const area = r.width * r.height;
    if (area > best && r.width > 80 && r.height > 60) {
      best = area;
      card = el;
    }
  }
  const r = card.getBoundingClientRect();
  // Regions that scroll internally — buttons inside them are legitimately
  // off-screen mid-content (Help Center topic links, Epson console rows).
  // The "footer" is the last button OUTSIDE any scroll region: on structural
  // dialogs that's the pinned action row; on small cards everything is in
  // scope; on footer-less dialogs (Epson) it's null and only the dismissal
  // rule applies.
  const scrollables = [...card.querySelectorAll<HTMLElement>('*')].filter((el) => {
    const s = getComputedStyle(el);
    return (s.overflowY === 'auto' || s.overflowY === 'scroll') && el.scrollHeight > el.clientHeight + 2;
  });
  const outsideScroll = (b: HTMLElement) => !scrollables.some((sc) => sc.contains(b));
  const hitTest = (btn: HTMLElement) => {
    const fr = btn.getBoundingClientRect();
    const inVp = fr.top >= 0 && fr.bottom <= vh && fr.left >= 0 && fr.right <= vw;
    let clickable = false;
    if (inVp) {
      const hit = document.elementFromPoint(fr.left + fr.width / 2, fr.top + fr.height / 2);
      clickable = !!hit && (hit === btn || btn.contains(hit) || hit.contains(btn));
    }
    return inVp && clickable;
  };
  const btnInfo = (b: HTMLButtonElement) => ({
    label: ((b.textContent || '').trim().slice(0, 24)) || b.getAttribute('aria-label') || '(icon)',
    ok: hitTest(b),
  });
  const btns = [...card.querySelectorAll<HTMLButtonElement>('button')].filter(vis);
  const pinned = btns.filter(outsideScroll);
  const footerBtn = pinned[pinned.length - 1] || null;
  // Dismissal: the header × / Close-style control must always be reachable.
  const closeBtn = btns.find((b) => /close|dismiss|cancel/i.test(b.getAttribute('aria-label') || '') || b.textContent?.trim() === '×') || null;
  return {
    opened: true,
    topOverflow: Math.max(0, Math.round(-r.top)),
    bottomOverflow: Math.max(0, Math.round(r.bottom - vh)),
    leftOverflow: Math.max(0, Math.round(-r.left)),
    rightOverflow: Math.max(0, Math.round(r.right - vw)),
    footer: footerBtn ? btnInfo(footerBtn) : null,
    dismissal: closeBtn ? btnInfo(closeBtn) : null,
  };
}

/** Visible fixed-position menubar dropdown panel geometry. */
function measureMenuPanel(): { opened: boolean; bottomOverflow?: number } {
  const vh = window.innerHeight;
  const vis = (el: Element) => {
    const s = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    return s.display !== 'none' && s.visibility !== 'hidden' && r.width > 0 && r.height > 0;
  };
  const els = [...document.querySelectorAll('div[role="menu"].fixed')].filter(vis);
  if (!els.length) return { opened: false };
  const r = els[els.length - 1].getBoundingClientRect();
  return {
    opened: true,
    bottomOverflow: Math.max(0, Math.round(r.bottom - vh)),
  };
}

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

async function measureDialogAfterOpen(page: Page): Promise<Measurement> {
  // Generous settle: the palette's close animation and the dialog's open
  // transition must both finish, or the fading overlay eats the hit-test.
  await page.waitForTimeout(650);
  let m = await page.evaluate(measureDialog);
  if (!m.opened) {
    await page.waitForTimeout(700);
    m = await page.evaluate(measureDialog);
  }
  return m;
}

function fitFailures(name: string, m: Measurement): string[] {
  if (!m.opened) return [`${name}: never opened`];
  const errs: string[] = [];
  const { topOverflow = 0, bottomOverflow = 0, leftOverflow = 0, rightOverflow = 0 } = m;
  if (topOverflow || bottomOverflow || leftOverflow || rightOverflow) {
    errs.push(`${name}: card overflows viewport (t/b/l/r ${topOverflow}/${bottomOverflow}/${leftOverflow}/${rightOverflow}px)`);
  }
  // Pinned action row (footer) must be usable on first paint, no scrolling.
  if (m.footer && !m.footer.ok) {
    errs.push(`${name}: footer "${m.footer.label}" not reachable without scrolling — pinned actions must be clickable on open`);
  }
  // Every dialog must be dismissable without scrolling, whatever its size.
  if (m.dismissal && !m.dismissal.ok) {
    errs.push(`${name}: close control "${m.dismissal.label}" not reachable without scrolling`);
  }
  return errs;
}

for (const vp of VIEWPORTS) {
  test(`every dialog fits a ${vp.name} window with reachable actions`, async ({ page }) => {
    test.setTimeout(300_000);
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await setupSession(page);
    const failures: string[] = [];

    for (const label of CP_DIALOGS) {
      const ran = await runPaletteCommand(page, label);
      if (!ran) {
        failures.push(`palette:${label}: no exact option matched`);
        await closeAllDialogs(page);
        continue;
      }
      failures.push(...fitFailures(`palette:${label}`, await measureDialogAfterOpen(page)));
      if (!(await closeAllDialogs(page))) await setupSession(page);
    }

    for (const [menu, item, name] of MENU_DIALOGS) {
      await page.getByRole('menuitem', { name: menu, exact: true }).first().hover();
      await page.waitForTimeout(350);
      await page.getByRole('menuitem', { name: item, exact: true }).last().click({ timeout: 5_000 });
      failures.push(...fitFailures(`menu:${name}`, await measureDialogAfterOpen(page)));
      if (!(await closeAllDialogs(page))) await setupSession(page);
    }

    expect(failures, failures.join('\n')).toEqual([]);
  });
}

for (const vp of VIEWPORTS) {
  test(`every menubar dropdown panel fits a ${vp.name} window`, async ({ page }) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.goto('/');
    await page.getByRole('menubar').waitFor({ state: 'visible', timeout: 20_000 });
    await page.waitForTimeout(500);
    const failures: string[] = [];
    for (const menu of MENUS) {
      await page.getByRole('menuitem', { name: menu, exact: true }).first().hover();
      await page.waitForTimeout(400);
      const m = await page.evaluate(measureMenuPanel);
      if (!m.opened) failures.push(`${menu}: panel did not open on hover`);
      else if ((m.bottomOverflow ?? 0) > 0) failures.push(`${menu}: panel overflows the window bottom by ${m.bottomOverflow}px`);
      await page.keyboard.press('Escape');
      await page.mouse.move(8, 400);
      await page.waitForTimeout(250);
    }
    expect(failures, failures.join('\n')).toEqual([]);
  });
}
