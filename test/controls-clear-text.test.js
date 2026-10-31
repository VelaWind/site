/**
 * The corner controls never sit on top of text.
 *
 * At 770px an outside review found the theme toggle and the palette button
 * covering a card's description while the page scrolled: they were fixed to
 * the screen while the content column ran under them. The guard measures
 * every text line on every page at three widths and fails if any line's box
 * meets the controls' box at any scroll position. A fixed element can meet
 * any line that shares its columns, so a fixed pair is checked against every
 * line horizontally; one that scrolls with the page is checked where it is.
 */
import { test } from 'node:test';
import { openPage, PAGES, noneOf } from './harness.js';

const WIDTHS = [375, 770, 1280, 1440];

test('no line of text can scroll under the corner controls', async (t) => {
  const page = await openPage();
  t.after(() => page.close());

  for (const width of WIDTHS) {
    for (const path of PAGES) {
      await page.emulate({ width, height: 800 });
      await page.goto(path);

      const hits = await page.json(`(() => {
        const controls = document.querySelector('.controls');
        if (!controls || getComputedStyle(controls).display === 'none') return [];
        const fixed = getComputedStyle(controls).position === 'fixed';
        const c = controls.getBoundingClientRect();
        const cTop = c.top + scrollY, cBottom = c.bottom + scrollY;
        const out = [];
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        const range = document.createRange();
        for (let node = walker.nextNode(); node; node = walker.nextNode()) {
          if (!node.textContent.trim()) continue;
          const el = node.parentElement;
          if (!el || controls.contains(el) || el.closest('.palette, .visually-hidden, .skip')) continue;
          const cs = getComputedStyle(el);
          if (cs.visibility === 'hidden' || cs.display === 'none') continue;
          range.selectNodeContents(node);
          for (const r of range.getClientRects()) {
            if (!r.width || !r.height) continue;
            const across = r.right > c.left && r.left < c.right;
            const down = fixed || (r.bottom + scrollY > cTop && r.top + scrollY < cBottom);
            if (across && down) {
              out.push(el.tagName.toLowerCase() + ': ' + node.textContent.trim().replace(/\\s+/g, ' ').slice(0, 40));
              break;
            }
          }
        }
        return out;
      })()`);

      noneOf(hits, `text under the corner controls on ${path} at ${width}px`, (h) => h);
    }
  }
});

test('no element pushes the page wider than the viewport at 375px', async (t) => {
  const page = await openPage();
  t.after(() => page.close());

  for (const path of PAGES) {
    await page.emulate({ width: 375, height: 800 });
    await page.goto(path);
    const wide = await page.json(`(() => [...document.querySelectorAll('main *')]
      .filter((el) => el.getBoundingClientRect().right > document.documentElement.clientWidth + 1
        && !el.closest('pre'))
      .map((el) => el.tagName.toLowerCase() + ': ' + (el.textContent || '').trim().slice(0, 40)))()`);
    noneOf(wide, `elements past the right edge on ${path} at 375px`, (h) => h);
  }
});
