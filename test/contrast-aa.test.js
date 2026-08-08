/**
 * Every pair of text and the thing behind it, on every page, in both schemes,
 * against WCAG AA: 4.5:1 for body text, 3:1 for large text.
 *
 * The palette is oklch and several surfaces are color-mix, so nothing here
 * parses a colour string. Each value is rasterised by the browser and the ratio
 * computed from the pixel that gets painted, which is the only number that
 * describes what a reader sees.
 */
import { test } from 'node:test';
import { openPage, PAGES, COLOUR_HELPERS, atLeast, noneOf } from './harness.js';

const AA_BODY = 4.5;
const AA_LARGE = 3;

const SCAN = `(() => { ${COLOUR_HELPERS}
  const rows = [];
  const seen = new Set();
  for (const el of document.querySelectorAll('body *')) {
    if (el.closest('#sky')) continue;
    // Only elements rendering their own text; a wrapper inherits its child's.
    if (![...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) continue;
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') continue;
    // A transparent fill is not ink. The gradient headline is painted by a
    // background clipped to the glyphs and is measured by its own test.
    if (cs.color === 'rgba(0, 0, 0, 0)') continue;

    const fg = px(cs.color);
    const bg = px(bgOf(el));
    const size = parseFloat(cs.fontSize);
    const weight = Number(cs.fontWeight) || 400;
    const large = size >= 24 || (size >= 18.66 && weight >= 700);
    const key = (typeof el.className === 'string' && el.className ? '.' + el.className.split(' ')[0] : el.tagName.toLowerCase()) + hex(fg) + hex(bg) + large;
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push({
      what: (typeof el.className === 'string' && el.className ? '.' + el.className.split(' ')[0] : el.tagName.toLowerCase()),
      fg: hex(fg), bg: hex(bg), size: Math.round(size), weight, large,
      ratio: Number(ratio(fg, bg).toFixed(2)),
      text: (el.textContent || '').trim().replace(/\\s+/g, ' ').slice(0, 28),
    });
  }
  return rows;
})()`;

for (const scheme of ['light', 'dark']) {
  test(`every text pair clears AA in the ${scheme} scheme`, async (t) => {
    const page = await openPage();
    t.after(() => page.close());

    let measured = 0;
    let lowest = { ratio: Infinity };

    for (const path of PAGES) {
      await page.emulate({ scheme });
      await page.goto(path);
      // Open the palette so its rows, hints and empty state are covered too.
      await page.evaluate(`document.querySelector('.palette')?.showModal()`);
      await page.sleep(250);

      const rows = await page.json(SCAN);
      measured += rows.length;

      const failures = rows.filter((r) => r.ratio < (r.large ? AA_LARGE : AA_BODY));
      for (const row of rows) if (row.ratio < lowest.ratio) lowest = { ...row, path };

      noneOf(
        failures,
        `text below WCAG AA in the ${scheme} scheme on ${path}`,
        (r) =>
          `expected ${r.large ? AA_LARGE : AA_BODY}:1, measured ${r.ratio}:1 for ${r.what} ` +
          `(${r.fg} on ${r.bg}), ${r.size}px/${r.weight}${r.large ? ' large' : ''}, ${scheme}, ${path} — "${r.text}"`,
      );
      await page.evaluate(`document.querySelector('.palette')?.close()`);
    }

    // A scan that silently matched nothing would pass forever.
    atLeast(measured, 40, `distinct text pairs found in the ${scheme} scheme, lowest ${lowest.ratio}:1 on ${lowest.what}`);
  });
}

test('the gradient headline clears AA at every point along the ramp', async (t) => {
  const page = await openPage();
  t.after(() => page.close());

  // Its computed colour is transparent, so the scan above skips it. The ink is
  // a three-stop gradient clipped to the glyphs, and the endpoints passing says
  // nothing about the middle.
  for (const scheme of ['light', 'dark']) {
    await page.emulate({ scheme });
    await page.goto('/');

    const result = await page.json(`(() => { ${COLOUR_HELPERS}
      const cs = getComputedStyle(document.documentElement);
      const bg = px(cs.getPropertyValue('--bg').trim());
      const stops = ['--star', '--accent', '--vio'].map((t) => px(cs.getPropertyValue(t).trim()));
      let worst = Infinity, at = null;
      for (let s = 0; s < stops.length - 1; s += 1) {
        for (let k = 0; k <= 40; k += 1) {
          const t = k / 40;
          const mix = stops[s].map((v, i) => v + (stops[s + 1][i] - v) * t);
          const r = ratio(mix, bg);
          if (r < worst) { worst = r; at = hex(mix.map(Math.round)); }
        }
      }
      const el = document.querySelector('.headline-accent');
      const size = parseFloat(getComputedStyle(el).fontSize);
      const weight = Number(getComputedStyle(el).fontWeight);
      return { worst: Number(worst.toFixed(2)), at, size: Math.round(size), weight,
        large: size >= 24 || (size >= 18.66 && weight >= 700), bg: hex(bg) };
    })()`);

    atLeast(
      result.worst,
      result.large ? AA_LARGE : AA_BODY,
      `the darkest point of the headline gradient (${result.at} on ${result.bg}), ${result.size}px/${result.weight}, ${scheme}, /`,
      ':1',
    );
  }
});

test('every hue the accent can be rerolled to still clears AA', async (t) => {
  const page = await openPage();
  t.after(() => page.close());

  // An easter egg can move --hue-sky to any of the five palette hues, and hue
  // changes luminance. The egg must not be able to leave the site less
  // readable than it found it.
  for (const scheme of ['light', 'dark']) {
    await page.emulate({ scheme });
    await page.goto('/');

    const rows = await page.json(`(() => { ${COLOUR_HELPERS}
      const root = document.documentElement;
      const out = [];
      for (const hue of [78, 150, 195, 250, 305]) {
        root.style.setProperty('--hue-sky', String(hue));
        const cs = getComputedStyle(root);
        const bg = px(cs.getPropertyValue('--bg').trim());
        for (const token of ['--accent', '--accent-strong']) {
          const fg = px(cs.getPropertyValue(token).trim());
          out.push({ hue, token, fg: hex(fg), bg: hex(bg), ratio: Number(ratio(fg, bg).toFixed(2)) });
        }
      }
      root.style.removeProperty('--hue-sky');
      return out;
    })()`);

    noneOf(
      rows.filter((r) => r.ratio < AA_BODY),
      `rerollable hues below AA in the ${scheme} scheme`,
      (r) => `expected ${AA_BODY}:1, measured ${r.ratio}:1 for ${r.token} at hue ${r.hue} (${r.fg} on ${r.bg}), ${scheme}`,
    );
  }
});
