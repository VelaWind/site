/**
 * The site with script switched off.
 *
 * The rule the site holds itself to is that script is an enhancement: every
 * route reads, every link works, and nothing is painted that cannot do
 * anything. The three JavaScript-only controls have to be invisible rather than
 * present and dead, and the theme still has to follow the device, because the
 * head script that reads the stored choice is the only thing that does not run.
 */
import { test } from 'node:test';
import { openPage, PAGES, atLeast, exactly, noneOf } from './harness.js';

for (const path of PAGES) {
  test(`${path} works with JavaScript disabled`, async (t) => {
    const page = await openPage();
    t.after(() => page.close());

    for (const scheme of ['light', 'dark']) {
      await page.emulate({ scheme });
      await page.setScripts(false);
      await page.goto(path, 800);

      const state = await page.json(`(() => {
        const links = [...document.querySelectorAll('a[href]')];
        const dead = links.filter((a) => { const h = a.getAttribute('href'); return !h || h === '#' || !h.trim(); });
        const blocks = [...document.querySelectorAll('main, main section, main .stats, main .project-grid, .readme, .site-footer')];
        const collapsed = blocks.filter((b) => b.getBoundingClientRect().height === 0);
        const jsOnly = [...document.querySelectorAll('.theme-toggle, .palette-open, .vela-light')]
          .filter((e) => getComputedStyle(e).display !== 'none')
          .map((e) => e.className);
        return {
          links: links.length,
          deadHrefs: dead.map((a) => a.outerHTML.slice(0, 60)),
          collapsed: collapsed.map((b) => b.tagName.toLowerCase() + '.' + (b.className || '')),
          jsOnly,
          dialogPainted: getComputedStyle(document.querySelector('.palette')).display !== 'none',
          horizontalOverflow: document.documentElement.scrollWidth > innerWidth,
          bodyHeight: Math.round(document.body.getBoundingClientRect().height),
          bodyBackground: getComputedStyle(document.body).backgroundColor,
        };
      })()`);

      atLeast(state.links, 8, `links on ${path} with script off, ${scheme}`);
      noneOf(state.deadHrefs, `links with no destination on ${path}, ${scheme}`, (h) => `expected a real href, measured ${h}`);
      noneOf(state.collapsed, `blocks collapsed to zero height on ${path}, ${scheme}`, (b) => `expected a laid-out box, measured height 0 for ${b}`);
      noneOf(state.jsOnly, `controls painted that need script to do anything on ${path}, ${scheme}`, (c) => `expected display none, measured visible for .${c}`);
      exactly(state.dialogPainted, false, `the command palette being painted with script off on ${path}, ${scheme}`);
      exactly(state.horizontalOverflow, false, `horizontal overflow on ${path} with script off, ${scheme}`);
      atLeast(state.bodyHeight, 400, `page height on ${path} with script off, ${scheme}`, 'px');
    }
  });
}

test('the theme still follows the device with script off', async (t) => {
  const page = await openPage();
  // No hook to re-enable scripts: the setting belongs to this tab, and the tab
  // is closed when the test ends.
  t.after(() => page.close());

  await page.setScripts(false);
  const seen = {};
  for (const scheme of ['light', 'dark']) {
    await page.emulate({ scheme });
    await page.goto('/', 800);
    seen[scheme] = await page.json(`({
      attribute: document.documentElement.dataset.theme ?? '(absent)',
      background: getComputedStyle(document.body).backgroundColor,
    })`);
    exactly(seen[scheme].attribute, '(absent)', `data-theme with script off under a ${scheme} device`);
  }

  exactly(
    seen.light.background !== seen.dark.background,
    true,
    `the light and dark backgrounds differing with script off (measured ${seen.light.background} and ${seen.dark.background})`,
  );
});

test('every page still reveals its sections once scrolled, with script off', async (t) => {
  const page = await openPage();
  // No hook to re-enable scripts: the setting belongs to this tab, and the tab
  // is closed when the test ends.
  t.after(() => page.close());

  // The reveal is a CSS scroll timeline, so it must keep working without script.
  await page.setScripts(false);
  await page.emulate({ motion: 'no-preference' });
  await page.goto('/', 800);
  await page.evaluate('scrollTo(0, document.documentElement.scrollHeight)');
  await page.sleep(900);

  const faded = await page.json(`(() => [...document.querySelectorAll('.reveal')]
      .map((el) => ({ what: '.' + el.className.split(' ').join('.'), opacity: Number(Number(getComputedStyle(el).opacity).toFixed(2)) }))
      .filter((e) => e.opacity < 0.99))()`);

  noneOf(
    faded,
    'sections still faded after scrolling to the bottom with script off',
    (e) => `expected opacity 1, measured ${e.opacity} for ${e.what}`,
  );
});
