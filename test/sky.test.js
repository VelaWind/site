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
import { CONSTELLATIONS, project, skyBox, starRadius } from '../src/scripts/sky/catalog.js';

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

/*
 * The 8/255 alpha floor is load-bearing in both directions. Below it sits the
 * nebula, whose resting alpha of 0.03 paints at ~7.65/255 — lowering the
 * floor to "see more stars" was tried and made the count measure the nebula's
 * area, which scales with min(width, height) and drowned every comparison.
 * Above it, the dimmest smallest field stars (alpha capped at 0.28 for
 * contrast, radii down to 0.25px) land within a whisker of the floor, so how
 * many of a random sky's stars register is itself slightly random. The floor
 * stays; the slope assertions below carry the tolerance instead.
 */
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
  /*
   * The slope, with a stated tolerance: each random sky rolls its own radii
   * and alphas, and with the dimmest stars a whisker above the ink floor a
   * 103-star sky once measured 6% fewer painted pixels than a 60-star one
   * (316 against 336). Adjacent steps therefore allow 0.85x for that noise,
   * and the full-span pair — 160 stars against 60 — is asserted strictly,
   * because if THAT ever inverts, the law is broken and not the proxy.
   */
  atLeast(ink[900], Math.round(ink[320] * 0.85), `painted pixels at 900px against 0.85x the 320px sky (measured ${ink[900]} and ${ink[320]})`);
  atLeast(ink[1400], Math.round(ink[900] * 0.85), `painted pixels at 1400px against 0.85x the 900px sky (measured ${ink[1400]} and ${ink[900]})`);
  atLeast(ink[1400], Math.round(ink[320] * 1.4), `painted pixels at 1400px (160 stars) against 1.4x the 320px sky (60 stars) — the strict full-span pair (measured ${ink[1400]} and ${ink[320]})`);
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

/*
 * The hover hot spot and the painted star must be the same point.
 *
 * The bug this guards: the painter applied drift, parallax and scroll rise as
 * one canvas translation while the name test undid only the parallax, so the
 * hot spot sat the drift plus 6% of scroll away from the pixels — measured at
 * 60px with 1000px scrolled, more than NAME_REACH, so pointing straight at a
 * star named nothing while empty sky below it did. It survived the full
 * suite, a contrast audit and two manual passes because nothing ever compared
 * the two numbers; this compares them, empirically. The painted centre is a
 * colour-matched pixel centroid; the hot centre is probed by dispatching
 * pointer moves and reading whether the name's glyph pixels actually painted,
 * chord midpoints along y then x. requestAnimationFrame is intercepted
 * before the page loads so every frame is stepped at a chosen virtual time:
 * the drift is real but frozen, and the measurement is deterministic.
 */
const RAF_HOOK = `(() => {
  const q = [];
  window.requestAnimationFrame = (cb) => { q.push(cb); return q.length; };
  window.cancelAnimationFrame = () => {};
  window.__step = (t) => { const cbs = q.splice(0); for (const cb of cbs) { try { cb(t); } catch (e) {} } return cbs.length; };
})();`;

const HOT_VS_PAINTED = `async (args) => {
  const { base, r, token, V, scroll } = args;
  scrollTo(0, scroll);
  const canvas = document.querySelector('#sky');
  const ctx = canvas.getContext('2d');
  const swatch = document.createElement('canvas').getContext('2d');
  swatch.fillStyle = getComputedStyle(document.documentElement).getPropertyValue(token).trim();
  swatch.fillRect(0, 0, 1, 1);
  const tokenPx = swatch.getImageData(0, 0, 1, 1).data;
  const hueOf = (px) => {
    const max = Math.max(px[0], px[1], px[2]), min = Math.min(px[0], px[1], px[2]);
    if (max === min) return { h: 0, s: 0 };
    let h;
    if (max === px[0]) h = ((px[1] - px[2]) / (max - min)) % 6;
    else if (max === px[1]) h = (px[2] - px[0]) / (max - min) + 2;
    else h = (px[0] - px[1]) / (max - min) + 4;
    return { h: ((h * 60) + 360) % 360, s: (max - min) / max };
  };
  const tokenHue = hueOf(tokenPx);
  const matches = (d, i, minAlpha) => {
    if (d[i + 3] < minAlpha) return false;
    const hs = hueOf([d[i], d[i + 1], d[i + 2]]);
    if (hs.s < 0.15) return false;
    const dh = Math.abs(hs.h - tokenHue.h);
    return Math.min(dh, 360 - dh) < 40;
  };
  const move = (x, y) => window.dispatchEvent(new PointerEvent('pointermove', { clientX: x, clientY: y }));
  const frame = () => new Promise((res) => { window.__step(V); setTimeout(res, 0); });

  // Painted centre: pointer parked well outside NAME_REACH, centroid of
  // token-hued pixels. The seed follows the scroll rise only so the search
  // window contains the star; the centroid itself is read from the pixels.
  move(base.x, base.y + 150);
  await frame();
  const seedY = base.y - scroll * 0.06;
  const x0 = Math.max(0, Math.round(base.x - 45)), y0 = Math.max(0, Math.round(seedY - 45));
  const img = ctx.getImageData(x0, y0, 90, 90);
  let sx = 0, sy = 0, n = 0;
  for (let yy = 0; yy < 90; yy += 1)
    for (let xx = 0; xx < 90; xx += 1) {
      const i = (yy * 90 + xx) * 4;
      if (matches(img.data, i, 90)) { sx += x0 + xx; sy += y0 + yy; n += 1; }
    }
  if (n < 2) return { error: 'no painted pixels found near (' + base.x.toFixed(0) + ', ' + seedY.toFixed(0) + ')' };
  const painted = { x: sx / n, y: sy / n };

  // The name is on when glyph-strength token pixels sit in the label box
  // up-right of the dot: alpha 140 excludes the halo (<=64) and lines (<=77).
  const labelOn = () => {
    const lx0 = Math.max(0, Math.round(painted.x + r + 3)), ly0 = Math.max(0, Math.round(painted.y - r - 16));
    const lx1 = Math.min(canvas.width, Math.round(painted.x + r + 78)), ly1 = Math.min(canvas.height, Math.round(painted.y - r + 3));
    if (lx1 <= lx0 || ly1 <= ly0) return false;
    const roi = ctx.getImageData(lx0, ly0, lx1 - lx0, ly1 - ly0);
    let count = 0;
    for (let i = 0; i < roi.data.length; i += 4) if (matches(roi.data, i, 140)) count += 1;
    return count >= 10;
  };
  const chord = async (fixed, axis) => {
    const hits = [];
    for (let o = -80; o <= 80; o += 2) {
      if (axis === 'x') move(painted.x + o, fixed); else move(fixed, painted.y + o);
      await frame();
      if (labelOn()) hits.push(o);
    }
    return hits.length ? (hits[0] + hits[hits.length - 1]) / 2 : null;
  };

  // y first: the vertical line through the painted x passes within drift-x of
  // the hot centre whatever the y error is, so a broken y offset is measured
  // rather than pushing the whole disc off the scan row.
  const cy = await chord(painted.x, 'y');
  if (cy === null) return { painted, error: 'the name never appeared on the y scan through the painted column' };
  const cx = await chord(painted.y + cy, 'x');
  if (cx === null) return { painted, error: 'the name never appeared on the x scan' };
  return { painted, hot: { x: painted.x + cx, y: painted.y + cy } };
}`;

test('the name hot spot sits on the painted star, scrolled and at the viewport edge', async (t) => {
  const page = await openPage();
  t.after(() => page.close());

  await page.send('Page.addScriptToEvaluateOnNewDocument', { source: RAF_HOOK });
  await page.emulate({ width: 1440, height: 900 });
  await page.goto('/', 1500);

  const box = skyBox(1440, 900);
  const target = (id) => {
    for (const c of CONSTELLATIONS) {
      const s = c.stars.find((star) => star.id === id);
      if (s) return { name: s.name, base: project(s.ra, s.dec, box), r: starRadius(s.m), token: c.token };
    }
    throw new Error(`no catalogue star ${id}`);
  };

  // V freezes the drift near its full amplitude, so the drift half of the old
  // bug is under test even in the unscrolled condition.
  const V = 9_037_500;
  const conditions = [
    { ...target('suhail'), scroll: 300, what: 'Suhail with the page scrolled 300px' },
    { ...target('canopus'), scroll: 0, what: 'Canopus at the right viewport edge' },
  ];

  for (const cond of conditions) {
    const result = await page.evaluate(
      `(${HOT_VS_PAINTED})(${JSON.stringify({ base: cond.base, r: cond.r, token: cond.token, V, scroll: cond.scroll })})`,
    );
    exactly(result.error ?? null, null, `measuring ${cond.what} (painted ${JSON.stringify(result.painted ?? 'not found')})`);
    const dx = result.hot.x - result.painted.x;
    const dy = result.hot.y - result.painted.y;
    atMost(Math.abs(dx), 2, `x gap between the hover hot spot and the painted star for ${cond.what} — they must be the same point; if this fails, some consumer stopped using screenOf() in sky.js`, 'px');
    atMost(Math.abs(dy), 2, `y gap between the hover hot spot and the painted star for ${cond.what} — they must be the same point; if this fails, some consumer stopped using screenOf() in sky.js`, 'px');
  }
});
