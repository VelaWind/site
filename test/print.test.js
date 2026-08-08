/**
 * What survives onto paper.
 *
 * This is the test that earned the suite. Sections on the home page are
 * revealed by a scroll-driven animation, and paper cannot be scrolled: the
 * timeline never advanced, so four of the five .reveal blocks printed at
 * opacity 0. Every browser check passed, because on a screen you scroll and
 * they appear. It was found only by asking the renderer for print media.
 *
 * The guard is that no element carrying content may be transparent when the
 * page is printed, whatever the mechanism that made it so.
 */
import { test } from 'node:test';
import { openPage, PAGES, atLeast, noneOf } from './harness.js';

test('nothing that carries content prints invisible', async (t) => {
  const page = await openPage();
  t.after(() => page.close());

  for (const path of PAGES) {
    await page.emulate({ media: 'print' });
    await page.goto(path);

    const faded = await page.json(`(() => {
      const out = [];
      for (const el of document.querySelectorAll('main *, main, .reveal, .site-footer')) {
        const cs = getComputedStyle(el);
        if (cs.display === 'none' || cs.visibility === 'hidden') continue;
        if (!(el.textContent || '').trim()) continue;
        const opacity = Number(cs.opacity);
        if (opacity >= 0.99) continue;
        out.push({
          what: el.tagName.toLowerCase() + (typeof el.className === 'string' && el.className ? '.' + el.className.split(' ').join('.') : ''),
          opacity: Number(opacity.toFixed(2)),
          text: (el.textContent || '').trim().replace(/\\s+/g, ' ').slice(0, 40),
        });
      }
      return out;
    })()`);

    noneOf(
      faded,
      `content below full opacity under print media on ${path}`,
      (e) => `expected opacity 1, measured ${e.opacity} for ${e.what} — "${e.text}"`,
    );
  }
});

test('the reveal animation does not apply to print at all', async (t) => {
  const page = await openPage();
  t.after(() => page.close());

  await page.emulate({ media: 'print' });
  await page.goto('/');

  const animated = await page.json(`(() => [...document.querySelectorAll('.reveal')].map((el) => ({
      what: '.' + el.className.split(' ').join('.'),
      animationName: getComputedStyle(el).animationName,
      opacity: Number(Number(getComputedStyle(el).opacity).toFixed(2)),
    })).filter((e) => e.animationName !== 'none'))()`);

  noneOf(
    animated,
    'reveal animations still bound under print media',
    (e) => `expected animation-name none, measured ${e.animationName} for ${e.what} at opacity ${e.opacity}`,
  );
});

test('screen furniture stays off the page', async (t) => {
  const page = await openPage();
  t.after(() => page.close());

  await page.emulate({ media: 'print' });
  await page.goto('/');

  const shown = await page.json(`(() => ['#sky', '.reading-progress', '.controls', '.palette']
      .map((sel) => ({ sel, display: document.querySelector(sel) ? getComputedStyle(document.querySelector(sel)).display : 'absent' }))
      .filter((e) => e.display !== 'none' && e.display !== 'absent'))()`);

  noneOf(
    shown,
    'decorative or interactive furniture visible under print media',
    (e) => `expected display none, measured ${e.display} for ${e.sel}`,
  );
});

test('a printed page still has its content on it', async (t) => {
  const page = await openPage();
  t.after(() => page.close());

  // A crude but effective backstop: if the reveal regressed, the PDF loses the
  // bulk of the home page and shrinks sharply.
  await page.emulate({ media: 'print' });
  await page.goto('/');
  const pdf = await page.send('Page.printToPDF', { printBackground: true, paperWidth: 8.27, paperHeight: 11.7 });
  const kilobytes = Math.round(Buffer.from(pdf.data, 'base64').length / 1024);

  atLeast(kilobytes, 100, 'the printed home page, which was 143 KB when four sections printed blank and 191 KB with them', ' KB');
});
