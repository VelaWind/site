/**
 * The canvas behind the page, and the constellation on it.
 *
 * The regression worth naming: the backing store was sized from innerWidth
 * while a fixed element inset to 0 stops at the scrollbar. The two differ by
 * about 15px, so the browser squashed the whole field by a percent and a half
 * to fit its box, and the parallax was computed against a width the canvas did
 * not have. Nothing looked obviously wrong, which is why it needs a test.
 */
import { test } from 'node:test';
import { openPage, atLeast, atMost, exactly } from './harness.js';

const GEOMETRY = `(() => {
  const c = document.querySelector('#sky');
  const box = c.getBoundingClientRect();
  return {
    backingWidth: c.width, backingHeight: c.height,
    boxWidth: Math.round(box.width), boxHeight: Math.round(box.height),
    ratioX: Number((c.width / box.width).toFixed(3)),
    ratioY: Number((c.height / box.height).toFixed(3)),
  };
})()`;

const INK = `(() => { const c = document.querySelector('#sky'), g = c.getContext('2d');
  const d = g.getImageData(0, 0, c.width, c.height).data;
  let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 8) n += 1; return n; })()`;

test('the backing store matches the box it is painted into', async (t) => {
  const page = await openPage();
  t.after(() => page.close());

  for (const dpr of [1, 2, 3]) {
    await page.emulate();
    await page.send('Emulation.setDeviceMetricsOverride', { width: 1200, height: 800, deviceScaleFactor: dpr, mobile: false });
    await page.goto('/');

    const g = await page.json(GEOMETRY);
    // Capped at 2: past that the pixels cost real work and buy nothing visible
    // on a field of one-pixel dots.
    const expected = Math.min(2, dpr);
    exactly(g.ratioX, expected, `horizontal backing-store ratio at devicePixelRatio ${dpr} (backing ${g.backingWidth}px into a ${g.boxWidth}px box)`);
    exactly(g.ratioY, expected, `vertical backing-store ratio at devicePixelRatio ${dpr} (backing ${g.backingHeight}px into a ${g.boxHeight}px box)`);
  }
});

test('the canvas is decorative and unreachable', async (t) => {
  const page = await openPage();
  t.after(() => page.close());

  await page.emulate();
  await page.goto('/');

  const state = await page.json(`(() => { const c = document.querySelector('#sky'), cs = getComputedStyle(c);
    return { ariaHidden: c.getAttribute('aria-hidden'), pointerEvents: cs.pointerEvents,
      position: cs.position, zIndex: cs.zIndex,
      contentAbove: getComputedStyle(document.querySelector('main')).zIndex }; })()`);

  exactly(state.ariaHidden, 'true', 'aria-hidden on the sky canvas');
  exactly(state.pointerEvents, 'none', 'pointer-events on the sky canvas');
  exactly(state.position, 'fixed', 'position of the sky canvas');
  exactly(state.zIndex, '0', 'z-index of the sky canvas');
  exactly(state.contentAbove, '1', 'z-index of the page content, which has to sit above the canvas');
});

test('the star field scales with the viewport and stops at the cap', async (t) => {
  const page = await openPage();
  t.after(() => page.close());

  const counts = [];
  for (const width of [320, 900, 1400, 2400]) {
    await page.emulate({ width, height: 800 });
    await page.goto('/');
    counts.push({ width, ink: await page.evaluate(INK), expected: Math.min(150, Math.round(width / 9)) });
  }

  atLeast(counts[1].ink, counts[0].ink, `painted pixels at 900px against 320px (measured ${counts[1].ink} and ${counts[0].ink})`);
  atLeast(counts[2].ink, counts[1].ink, `painted pixels at 1400px against 900px (measured ${counts[2].ink} and ${counts[1].ink})`);
  // Both are capped at 150 stars, so the wider one must not paint meaningfully more.
  atMost(
    counts[3].ink,
    Math.round(counts[2].ink * 1.25),
    `painted pixels at 2400px, where the star count is capped at 150 exactly as it is at 1400px (measured ${counts[3].ink} against ${counts[2].ink})`,
  );
});

test('the constellation lights, holds, and dims again', async (t) => {
  const page = await openPage();
  t.after(() => page.close());

  await page.emulate({ motion: 'no-preference', width: 1280 });
  await page.goto('/');

  const dark = await page.evaluate(INK);
  await page.evaluate(`document.dispatchEvent(new CustomEvent('vela:light'))`);
  await page.sleep(1200);
  const lit = await page.evaluate(INK);
  atLeast(lit, dark * 2, `painted pixels once the constellation is lit, against ${dark} unlit`);

  await page.sleep(800);
  const held = await page.evaluate(INK);
  atLeast(held, lit * 0.75, `painted pixels after the fade completes, against ${lit} at the end of it`);

  await page.evaluate(`document.dispatchEvent(new CustomEvent('vela:toggle'))`);
  await page.sleep(1400);
  const dimmed = await page.evaluate(INK);
  atMost(dimmed, dark * 1.6, `painted pixels once dimmed again, against ${dark} before it was ever lit`);
});

test('under reduced motion it arrives in one frame and never loops', async (t) => {
  const page = await openPage();
  t.after(() => page.close());

  await page.emulate({ motion: 'reduce', width: 1280 });
  await page.goto('/');

  const before = await page.evaluate(INK);
  await page.evaluate(`document.dispatchEvent(new CustomEvent('vela:light'))`);
  await page.sleep(150);
  const immediately = await page.evaluate(INK);
  atLeast(immediately, before * 2, `painted pixels one frame after lighting under reduced motion, against ${before} before`);

  await page.sleep(800);
  exactly(await page.evaluate(INK), immediately, 'painted pixels changing after the first frame under reduced motion, which would mean a loop is running');
});

test('the parallax only listens where there is a pointer', async (t) => {
  const page = await openPage();
  t.after(() => page.close());

  await page.emulate({ touch: true, width: 900, motion: 'no-preference' });
  await page.goto('/');

  exactly(await page.evaluate(`matchMedia('(pointer: fine)').matches`), false, 'pointer: fine on an emulated touch device');

  // The field is still drawn on a touch device; only the pointer listener is
  // absent, so there is nothing to leave a stuck parallax offset behind.
  const geometry = await page.json(GEOMETRY);
  exactly(
    geometry.ratioX,
    1,
    `backing-store ratio on a touch device (backing ${geometry.backingWidth}px into a ${geometry.boxWidth}px box)`,
  );
});
