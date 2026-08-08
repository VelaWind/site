/**
 * Under prefers-reduced-motion: reduce, the page must not move at all.
 *
 * Not "less motion": none. The site's own rule is that everything animated
 * lives inside a no-preference guard, and the canvas is the part that is easy
 * to forget, because it is painted by script rather than by the stylesheet and
 * no CSS audit would ever catch it.
 *
 * Checked two ways, because either alone can lie. Computed style says what the
 * page declared; successive frames say what it did.
 */
import { test } from 'node:test';
import { openPage, PAGES, exactly, noneOf } from './harness.js';

test('no element declares motion under reduce', async (t) => {
  const page = await openPage();
  t.after(() => page.close());

  for (const path of PAGES) {
    await page.emulate({ motion: 'reduce' });
    await page.goto(path);
    // Start everything that could be running before asking whether anything is.
    await page.evaluate(`document.dispatchEvent(new CustomEvent('vela:light')); scrollTo(0, 300);`);
    await page.sleep(600);

    const moving = await page.json(`(() => {
      const out = [];
      for (const el of document.querySelectorAll('*')) {
        for (const pseudo of [null, '::before', '::after']) {
          const cs = getComputedStyle(el, pseudo);
          const animating = cs.animationName !== 'none' && cs.animationPlayState !== 'paused';
          const transitioning = parseFloat(cs.transitionDuration) > 0;
          if (!animating && !transitioning) continue;
          out.push({
            what: el.tagName.toLowerCase() + (typeof el.className === 'string' && el.className ? '.' + el.className.split(' ')[0] : '') + (pseudo ?? ''),
            animationName: animating ? cs.animationName : 'none',
            transitionDuration: cs.transitionDuration,
          });
        }
      }
      return out.slice(0, 20);
    })()`);

    noneOf(
      moving,
      `elements declaring motion under reduced motion on ${path}`,
      (e) => `expected animation-name none and transition-duration 0s, measured animation ${e.animationName} / transition ${e.transitionDuration} for ${e.what}`,
    );
  }
});

test('successive frames are identical under reduce, canvas included', async (t) => {
  const page = await openPage();
  t.after(() => page.close());

  for (const path of PAGES) {
    await page.emulate({ motion: 'reduce' });
    await page.goto(path);
    await page.evaluate(`document.dispatchEvent(new CustomEvent('vela:light'));`);
    await page.sleep(600);

    const frames = [];
    const canvases = [];
    for (let i = 0; i < 3; i += 1) {
      frames.push(await page.screenshotHash());
      canvases.push(await page.evaluate(`document.querySelector('#sky')?.toDataURL().slice(-48) ?? 'no canvas'`));
      await page.sleep(350);
    }

    exactly(new Set(frames).size, 1, `distinct rendered frames over 1 second on ${path} (hashes ${frames.map((h) => h.slice(0, 8)).join(', ')})`);
    exactly(new Set(canvases).size, 1, `distinct canvas contents over 1 second on ${path}`);
  }
});

test('with motion allowed the page does move, so the check above means something', async (t) => {
  const page = await openPage();
  t.after(() => page.close());

  await page.emulate({ motion: 'no-preference' });
  await page.goto('/');
  await page.sleep(400);

  const before = await page.evaluate(`document.querySelector('#sky').toDataURL().slice(-48)`);
  await page.sleep(700);
  const after = await page.evaluate(`document.querySelector('#sky').toDataURL().slice(-48)`);

  exactly(before === after, false, 'the canvas being static with motion allowed, which would mean the stillness test proves nothing');
});
