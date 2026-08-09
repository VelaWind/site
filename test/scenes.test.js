/**
 * The card scenes are pure functions, and this is the payoff: they can be
 * called against a stub context with hostile arguments and must simply not
 * throw. A scene that divides by a zero width, or walks off its own data at a
 * large t, fails here in milliseconds instead of as a blank card panel that
 * nobody reports.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SCENES } from '../src/scripts/sky/scenes.js';
import { atLeast } from './harness.js';

/**
 * The stub: every method the scenes are allowed to use, recording only how
 * often it was painted with. If a scene grows a call this stub lacks, the
 * test throws on exactly that call, which is the right failure.
 */
function stubContext() {
  const counts = { paths: 0, fills: 0, strokes: 0, rects: 0 };
  const noop = () => {};
  return {
    counts,
    beginPath: () => { counts.paths += 1; },
    fill: () => { counts.fills += 1; },
    stroke: () => { counts.strokes += 1; },
    fillRect: () => { counts.rects += 1; },
    moveTo: noop,
    lineTo: noop,
    arc: noop,
    ellipse: noop,
    closePath: noop,
    save: noop,
    restore: noop,
    translate: noop,
    rotate: noop,
    setLineDash: noop,
    clearRect: noop,
    globalAlpha: 1,
    lineWidth: 1,
    fillStyle: '',
    strokeStyle: '',
  };
}

const CASES = [
  { w: 350, h: 197, label: 'a card-sized box' },
  { w: 0, h: 0, label: 'a zero-sized box, which happens for one frame during a resize' },
  { w: 1, h: 1, label: 'a one-pixel box' },
];
const TIMES = [0, 1, 7, 1000, 86400];

for (const [name, scene] of Object.entries(SCENES)) {
  test(`scene "${name}" never throws, at any time, in any box, hot or cold`, () => {
    for (const { w, h, label } of CASES) {
      for (const t of TIMES) {
        for (const hot of [0, 1]) {
          const ctx = stubContext();
          assert.doesNotThrow(
            () => scene(ctx, w, h, t, hot),
            `${name} threw at t=${t}, hot=${hot}, in ${label}`,
          );
          // globalAlpha must be handed back at 1: a scene that leaks its last
          // alpha dims whatever the shared loop draws next.
          assert.equal(ctx.globalAlpha, 1, `${name} left globalAlpha at ${ctx.globalAlpha} (t=${t}, ${label})`);
        }
      }
    }

    // And in a real-sized box it actually draws something: a scene that
    // passes by painting nothing is not a scene.
    const ctx = stubContext();
    scene(ctx, 350, 197, 7, 0);
    atLeast(
      ctx.counts.fills + ctx.counts.strokes + ctx.counts.rects,
      3,
      `paint calls from "${name}" at t=7 in a card-sized box`,
    );
  });
}
