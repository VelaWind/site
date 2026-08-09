/**
 * The arrival sequence's two non-negotiable behaviours, tested in the real
 * browser: the page must be intact with no JavaScript at all, and reduced
 * motion must mean no loop — not a shorter sequence, none.
 *
 * The readability requirement (the lede within about two seconds) is verified
 * here too, as the time at which the lede's computed opacity crosses
 * two-thirds on a cold full sequence.
 */
import { test } from 'node:test';
import { openPage, atLeast, atMost, exactly } from './harness.js';

test('with JavaScript disabled the lede is visible: non-zero opacity, non-zero height', async (t) => {
  const page = await openPage();
  t.after(() => page.close());

  await page.emulate({ motion: 'no-preference' });
  await page.setScripts(false);
  await page.goto('/');

  const lede = await page.json(`(() => {
    const el = document.querySelector('.lede');
    const cs = getComputedStyle(el);
    const box = el.getBoundingClientRect();
    return { opacity: Number(cs.opacity), height: box.height, filter: cs.filter,
      arm: document.documentElement.hasAttribute('data-arrive') };
  })()`);

  exactly(lede.arm, false, 'the data-arrive attribute with scripts disabled, which must never be set');
  exactly(lede.opacity, 1, 'the lede paragraph opacity with JavaScript disabled');
  atLeast(lede.height, 20, 'the lede paragraph measured height with JavaScript disabled', 'px');
  exactly(lede.filter, 'none', 'the lede filter with JavaScript disabled');
});

test('under reduced motion no requestAnimationFrame loop is running one second after load', async (t) => {
  const page = await openPage();
  t.after(() => page.close());

  await page.emulate({ motion: 'reduce' });
  await page.goto('/');

  // Count new frame requests over one second: a running loop reschedules
  // itself every frame, so a healthy still page counts zero.
  const scheduled = await page.evaluate(`new Promise((resolve) => {
    let n = 0;
    const original = window.requestAnimationFrame;
    window.requestAnimationFrame = (fn) => { n += 1; return original.call(window, fn); };
    setTimeout(() => { window.requestAnimationFrame = original; resolve(n); }, 1000);
  })`);
  exactly(scheduled, 0, 'requestAnimationFrame calls scheduled during one second under reduced motion');

  // And the page is already in its final state: nothing waiting on a wave.
  const lede = await page.json(`(() => {
    const cs = getComputedStyle(document.querySelector('.lede'));
    return { opacity: Number(cs.opacity), arm: document.documentElement.hasAttribute('data-arrive') };
  })()`);
  exactly(lede.arm, false, 'the data-arrive attribute under reduced motion, which must never be set');
  exactly(lede.opacity, 1, 'the lede opacity under reduced motion');
});

test('on a cold full sequence the lede is readable within about two seconds', async (t) => {
  const page = await openPage();
  t.after(() => page.close());

  await page.emulate({ motion: 'no-preference', width: 1440, height: 900 });
  // A cold session: the full sequence gates on sessionStorage, so it is
  // cleared before the navigation rather than hoping this tab is fresh.
  await page.goto('/', 0);
  await page.evaluate(`sessionStorage.clear()`);
  await page.send('Page.navigate', { url: (await page.evaluate('location.origin')) + '/' });
  // Long enough for the navigation to commit, short enough that the sampler
  // is installed while the sequence is still in its pre-roll.
  await page.sleep(300);

  /*
   * Sample the lede's opacity until it crosses 2/3 — the point at which text
   * stops reading as "arriving" and starts reading as text — and report it
   * in the page's own clock, performance.now(), which is time since the
   * navigation started. That makes the number the requirement itself: the
   * visitor's wait, not the sampler's.
   */
  const crossed = await page.evaluate(`new Promise((resolve) => {
    const tick = () => {
      const el = document.querySelector('.lede');
      const opacity = el ? Number(getComputedStyle(el).opacity) : 0;
      if (opacity >= 0.66) return resolve(performance.now() / 1000);
      if (performance.now() > 8000) return resolve(-1);
      requestAnimationFrame(tick);
    };
    tick();
  })`);

  atLeast(crossed, 0, 'the lede ever crossing 2/3 opacity (-1 means it never did)', 's');
  atMost(crossed, 2.2, 'page time at which the lede crossed 2/3 opacity on a cold full sequence', 's');
});
