/**
 * The command palette.
 *
 * The regression worth naming: the filter used to match a row's whole text,
 * including the hint beside it. Both hints contain the site's own name, so
 * typing "vela" matched three rows, put "Email me" first, and Enter opened a
 * mail client instead of doing the thing that was asked for. A substring match
 * over the wrong substring is exactly the sort of bug that reads fine.
 */
import { test } from 'node:test';
import { openPage, exactly, atLeast, noneOf } from './harness.js';

const STATE = `({
  open: document.querySelector('.palette').open,
  focus: document.activeElement.className || document.activeElement.tagName,
  shown: [...document.querySelectorAll('.palette [role="option"]')].filter((r) => !r.hidden).map((r) => r.textContent.trim()),
  selected: [...document.querySelectorAll('.palette [aria-selected="true"]')].map((r) => r.id),
  activeDescendant: document.querySelector('.palette-input').getAttribute('aria-activedescendant'),
  emptyShown: !document.querySelector('.palette-empty').hidden,
  emptyText: document.querySelector('.palette-empty').textContent.trim(),
  status: document.querySelector('.palette-status').textContent.trim(),
})`;

async function open(page) {
  await page.key('k', { code: 'KeyK', modifiers: 2 });
  await page.sleep(280);
}

test('a filter matches the action, not the hint beside it', async (t) => {
  const page = await openPage();
  t.after(() => page.close());

  await page.emulate();
  await page.goto('/');
  await open(page);
  await page.type('vela');
  await page.sleep(200);

  const state = await page.json(STATE);
  exactly(
    state.shown.length,
    1,
    `rows matching "vela" (measured: ${JSON.stringify(state.shown)}) — the hints contain the site name, so matching them made Enter open a mail client`,
  );
  exactly(state.shown[0], 'Light the Vela constellation', 'the row that "vela" selects');
});

test('filtering is a case-insensitive substring, and an empty result says so', async (t) => {
  const page = await openPage();
  t.after(() => page.close());

  await page.emulate();
  await page.goto('/');
  await open(page);

  await page.type('THEM');
  await page.sleep(200);
  let state = await page.json(STATE);
  exactly(state.shown.length, 1, `rows matching "THEM" in upper case (measured: ${JSON.stringify(state.shown)})`);

  for (let i = 0; i < 4; i += 1) await page.key('Backspace', { code: 'Backspace' });
  await page.type('zzz');
  await page.sleep(200);
  state = await page.json(STATE);
  exactly(state.shown.length, 0, 'rows matching "zzz"');
  exactly(state.emptyShown, true, 'the empty-result line being shown when nothing matches');
  atLeast(state.emptyText.length, 20, `the empty-result line, which must not be a blank box (measured "${state.emptyText}")`, ' characters');
});

test('arrow keys move the selection and aria-selected follows it', async (t) => {
  const page = await openPage();
  t.after(() => page.close());

  await page.emulate();
  await page.goto('/');
  await open(page);

  const first = await page.json(STATE);
  exactly(first.focus, 'palette-input', 'where focus goes when the palette opens');
  exactly(first.selected.length, 1, `rows carrying aria-selected on open (measured ${JSON.stringify(first.selected)})`);
  exactly(first.activeDescendant, first.selected[0], 'aria-activedescendant pointing at the selected row');

  await page.key('ArrowDown', { code: 'ArrowDown' });
  const second = await page.json(STATE);
  exactly(second.selected.length, 1, 'rows carrying aria-selected after ArrowDown');
  exactly(
    second.selected[0] !== first.selected[0],
    true,
    `the selection moving on ArrowDown (measured ${first.selected[0]} then ${second.selected[0]})`,
  );

  await page.key('ArrowUp', { code: 'ArrowUp' });
  exactly((await page.json(STATE)).selected[0], first.selected[0], 'the selection returning on ArrowUp');
});

test('Enter runs the selected row', async (t) => {
  const page = await openPage();
  t.after(() => page.close());

  await page.emulate();
  await page.goto('/');
  await open(page);
  await page.type('copy');
  await page.key('Enter', { code: 'Enter' });
  await page.sleep(350);

  const status = await page.evaluate(`document.querySelector('.palette-status').textContent.trim()`);
  atLeast(status.length, 1, 'the status line after running "Copy email to clipboard", which must report what happened');
  exactly(status.includes('@'), true, `the status naming the address it copied (measured "${status}")`);
});

test('a link row closes the palette rather than leaving it over the page', async (t) => {
  const page = await openPage();
  t.after(() => page.close());

  await page.emulate();
  await page.goto('/');
  await open(page);
  await page.type('about');
  await page.key('Enter', { code: 'Enter' });
  await page.sleep(700);

  exactly(await page.evaluate(`document.querySelector('.palette').open`), false, 'the palette staying open after a same-page jump');
  exactly(await page.evaluate(`location.hash`), '#about', 'where the "Jump to About" row went');
});

test('every action has a plain equivalent outside the palette', async (t) => {
  const page = await openPage();
  t.after(() => page.close());

  // The palette is a shortcut and never the only way. Checked on a case study,
  // which is where the promise was quietly broken once.
  for (const path of ['/', '/projects/vela-sea']) {
    await page.emulate();
    await page.goto(path);

    const missing = await page.json(`(() => {
      const outside = (selector) => [...document.querySelectorAll(selector)].some((el) => !el.closest('.palette'));
      const checks = {
        'an email link': outside('a[href^="mailto:"]'),
        'a GitHub link': outside('a[href*="github.com"]'),
        'the theme control': outside('.theme-toggle'),
        'the constellation control': outside('.vela-light'),
      };
      return Object.entries(checks).filter(([, ok]) => !ok).map(([name]) => name);
    })()`);

    noneOf(missing, `palette actions with no plain equivalent on ${path}`, (m) => `expected ${m} outside the palette, measured none`);
  }
});
