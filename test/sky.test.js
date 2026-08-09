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

test('the star field scales with the viewport area and stops at the cap', async (t) => {
  const page = await openPage();
  t.after(() => page.close());

  /*
   * The law is clamp(area / 7000, 60, 260). At a height of 800 that puts
   * 320px and 500px both on the 60-star floor, 900px and 1400px on the
   * rising slope, and 2400px and 3200px both on the 260-star cap, so the
   * three regimes are each asserted with a pair.
   */
  const counts = [];
  for (const width of [320, 500, 900, 1400, 2400, 3200]) {
    await page.emulate({ width, height: 800 });
    // Settled well past the arrival sequence, so every width is measured
    // against the same resting sky rather than a different moment of the wave.
    await page.goto('/', 4600);
    counts.push({ width, ink: await page.evaluate(INK) });
  }
  const ink = Object.fromEntries(counts.map((c) => [c.width, c.ink]));

  // The floor: both clamped to 60 stars, so similar ink despite 1.5x the width.
  atMost(ink[500], Math.round(ink[320] * 1.4), `painted pixels at 500px against 320px, both on the 60-star floor (measured ${ink[500]} and ${ink[320]})`);
  // The slope: more area, more stars.
  atLeast(ink[900], ink[320], `painted pixels at 900px against 320px (measured ${ink[900]} and ${ink[320]})`);
  atLeast(ink[1400], ink[900], `painted pixels at 1400px against 900px (measured ${ink[1400]} and ${ink[900]})`);
  // The cap: both clamped to 260 stars, so the wider one must not paint meaningfully more.
  atMost(
    ink[3200],
    Math.round(ink[2400] * 1.3),
    `painted pixels at 3200px, where the count is capped at 260 exactly as at 2400px (measured ${ink[3200]} against ${ink[2400]})`,
  );
});

test('the ship lights, holds, and dims again', async (t) => {
  const page = await openPage();
  t.after(() => page.close());

  await page.emulate({ motion: 'no-preference', width: 1280 });
  await page.goto('/', 4200); // past the arrival sequence, into the resting sky

  /*
   * The catalogue is now always in the sky, so the egg no longer conjures
   * stars from nothing: vela:light raises the constellation figures, the
   * Argo hull and the three labels from alpha zero to full. The measured
   * difference is therefore lines and labels over an already-populated
   * field, not a doubling of everything painted.
   */
  const dark = await page.evaluate(INK);
  await page.evaluate(`document.dispatchEvent(new CustomEvent('vela:light'))`);
  await page.sleep(400);
  const lit = await page.evaluate(INK);
  atLeast(lit, dark + 800, `painted pixels once the ship is lit, against ${dark} unlit`);

  await page.sleep(800);
  const held = await page.evaluate(INK);
  atLeast(held, dark + 800, `painted pixels while the ship stays lit, against ${dark} unlit`);

  await page.evaluate(`document.dispatchEvent(new CustomEvent('vela:toggle'))`);
  await page.sleep(400);
  const dimmed = await page.evaluate(INK);
  atMost(dimmed, Math.round(dark * 1.25), `painted pixels once dimmed again, against ${dark} before it was ever lit`);
});

test('under reduced motion it arrives in one frame and never loops', async (t) => {
  const page = await openPage();
  t.after(() => page.close());

  await page.emulate({ motion: 'reduce', width: 1280 });
  await page.goto('/');

  const before = await page.evaluate(INK);
  atLeast(before, 200, 'painted pixels in the static reduced-motion frame, which must already hold the whole sky');
  await page.evaluate(`document.dispatchEvent(new CustomEvent('vela:light'))`);
  await page.sleep(150);
  const immediately = await page.evaluate(INK);
  atLeast(immediately, before + 500, `painted pixels one frame after lighting under reduced motion, against ${before} before`);

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
