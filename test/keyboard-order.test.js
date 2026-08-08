/**
 * Tabbing through the site with real Tab presses.
 *
 * Three properties, and the third is the one that has actually been broken
 * here: focus must never land somewhere invisible. An easter egg once
 * translated four cards 120vh off screen and left them focusable, so tabbing
 * into that window put the focus ring where nobody could see it.
 */
import { test } from 'node:test';
import { openPage, PAGES, atLeast, exactly, noneOf } from './harness.js';

const STOP = `(() => {
  const el = document.activeElement;
  if (!el || el === document.body) return null;
  const cs = getComputedStyle(el);
  const r = el.getBoundingClientRect();
  return {
    what: el.id || (typeof el.className === 'string' && el.className ? '.' + el.className.split(' ')[0] : el.tagName.toLowerCase()),
    text: (el.textContent || el.getAttribute('aria-label') || '').trim().replace(/\\s+/g, ' ').slice(0, 30),
    visible: r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth,
    ring: (cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0) || cs.boxShadow !== 'none',
  };
})()`;

async function walk(page, limit = 40) {
  await page.resetFocus();
  const stops = [];
  for (let i = 0; i < limit; i += 1) {
    await page.tab();
    const stop = await page.json(STOP);
    if (!stop) break;
    if (stops.some((s) => s.what === stop.what && s.text === stop.text)) break;
    stops.push(stop);
  }
  return stops;
}

for (const path of PAGES) {
  test(`every tab stop on ${path} is visible and shows focus`, async (t) => {
    const page = await openPage();
    t.after(() => page.close());

    await page.emulate();
    await page.goto(path);
    const stops = await walk(page);

    atLeast(stops.length, 5, `tab stops found on ${path}`);
    noneOf(
      stops.filter((s) => !s.visible),
      `tab stops off screen on ${path}`,
      (s) => `expected the focused element to be within the viewport, measured off screen for ${s.what} — "${s.text}"`,
    );
    noneOf(
      stops.filter((s) => !s.ring),
      `tab stops with no visible focus indicator on ${path} (WCAG 2.4.7)`,
      (s) => `expected an outline or box-shadow, measured neither for ${s.what} — "${s.text}"`,
    );
  });
}

test('the command palette traps focus and gives it back', async (t) => {
  const page = await openPage();
  t.after(() => page.close());

  await page.emulate();
  await page.goto('/');

  await page.evaluate(`document.querySelector('.palette-open').focus()`);
  await page.press('Enter');
  await page.sleep(200);

  exactly(await page.evaluate(`document.querySelector('.palette').open`), true, 'the palette opening from Enter on its trigger');
  exactly(await page.evaluate(`document.activeElement.className`), 'palette-input', 'where focus lands when the palette opens');

  const escaped = [];
  for (let i = 0; i < 16; i += 1) {
    await page.tab();
    const where = await page.json(`(() => { const el = document.activeElement;
      const inDialog = document.querySelector('.palette').contains(el);
      return { what: el === document.body ? '(browser UI)' : (el.id || el.className || el.tagName),
        reachedPageBehind: el !== document.body && !inDialog }; })()`);
    if (where.reachedPageBehind) escaped.push(where);
  }
  noneOf(
    escaped,
    'tabs that reached the page behind an open modal dialog',
    (e) => `expected focus to stay in the dialog, measured focus on ${e.what}`,
  );

  exactly(
    await page.evaluate(`(() => { const a = document.querySelector('.wordmark'); a.focus(); return document.activeElement !== a; })()`),
    true,
    'the page behind the dialog being inert',
  );

  await page.key('Escape', { code: 'Escape' });
  await page.sleep(300);
  exactly(await page.evaluate(`document.querySelector('.palette').open`), false, 'the palette closing on Escape');
  exactly(await page.evaluate(`document.activeElement.className`), 'palette-open', 'where focus returns after Escape');
});

test('the gravity egg removes its blocks from the tab order and puts them back exactly', async (t) => {
  const page = await openPage();
  t.after(() => page.close());

  await page.emulate({ motion: 'no-preference' });
  await page.goto('/');

  const before = await walk(page);

  await page.evaluate('scrollTo(0, 0)');
  for (const key of ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight']) {
    await page.key(key, { code: key });
  }
  await page.key('b', { text: 'b' });
  await page.key('a', { text: 'a' });
  await page.sleep(700);

  const during = await walk(page);
  noneOf(
    during.filter((s) => !s.visible),
    'tab stops off screen while the gravity egg is running',
    (s) => `expected the focused element to be within the viewport, measured off screen for ${s.what} — "${s.text}"`,
  );

  await page.sleep(4200);
  exactly(await page.evaluate(`document.querySelectorAll('[inert]').length`), 0, 'inert attributes left behind after the egg reversed');
  exactly(await page.evaluate(`document.querySelectorAll('.gravity, .gravity-fall').length`), 0, 'gravity classes left behind after the egg reversed');

  const after = await walk(page);
  exactly(
    JSON.stringify(after.map((s) => s.what + '|' + s.text)),
    JSON.stringify(before.map((s) => s.what + '|' + s.text)),
    'the tab order after the egg, compared with before it',
  );
});
