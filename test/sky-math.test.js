/**
 * The sky's geometry, held to account without a browser.
 *
 * These import the catalogue and projection directly, because the bug they
 * exist for is the one that would be invisible to the site's owner and
 * obvious to an astronomer: a mirrored chart, a star nudged to look nicer, a
 * link pointing at a star that is not there. Someone who knows the southern
 * sky should recognise this sky, and that is a testable claim.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ARRIVAL,
  CONSTELLATIONS,
  HULL,
  computeArrival,
  easeOutCubic,
  project,
  skyBox,
  starById,
  starRadius,
} from '../src/scripts/sky/catalog.js';
// Node 23+ strips erasable TypeScript on import, so the test reads the real
// project list rather than a copy that would drift from it.
import { projects } from '../src/lib/projects.ts';
import { atLeast, atMost, exactly } from './harness.js';

const box = skyBox(1440, 900);
const at = (id) => {
  const s = starById(id);
  assert.ok(s, `no catalogue star with id ${id}`);
  return project(s.ra, s.dec, box);
};

test('the RA flip is correct: a higher right ascension is further LEFT', () => {
  // γ Velorum (RA 8.16) against Canopus (RA 6.40): Vela is east of Carina,
  // and on a sky chart east is left, so the higher RA must have the smaller x.
  const gamma = at('gamma-velorum');
  const canopus = at('canopus');
  const naos = at('naos');
  atLeast(canopus.x - gamma.x, 1, 'Canopus (RA 6.40) sitting right of γ Velorum (RA 8.16)', 'px');
  atLeast(gamma.x - at('mu-velorum').x, 1, 'γ Velorum (RA 8.16) sitting right of μ Velorum (RA 10.78)', 'px');

  // Relative order top to bottom: Naos (dec -40) above γ Velorum (-47.3),
  // which is above Canopus (-52.7). Declination runs down the chart.
  atLeast(gamma.y - naos.y, 1, 'γ Velorum below Naos (dec -47.3 against -40.0)', 'px');
  atLeast(canopus.y - gamma.y, 1, 'Canopus below γ Velorum (dec -52.7 against -47.3)', 'px');
});

test('star radius is monotonic in magnitude', () => {
  // Magnitude runs backwards: Canopus at -0.7 is the brightest star in this
  // sky and must be drawn larger than the faintest catalogue entry.
  atLeast(
    starRadius(-0.7) - starRadius(3.6),
    1,
    `Canopus (m -0.7, ${starRadius(-0.7).toFixed(2)}px) against ψ Velorum (m 3.6, ${starRadius(3.6).toFixed(2)}px)`,
    'px',
  );
  const sorted = [...new Set([-0.7, 1.7, 1.8, 2.3, 2.7, 3.2, 3.6])];
  for (let i = 1; i < sorted.length; i += 1) {
    atLeast(
      starRadius(sorted[i - 1]),
      starRadius(sorted[i]),
      `radius at m ${sorted[i - 1]} against m ${sorted[i]}`,
    );
  }
});

test('every link index in every constellation refers to a star that exists', () => {
  for (const c of CONSTELLATIONS) {
    for (const [a, b] of c.links) {
      assert.ok(
        Number.isInteger(a) && a >= 0 && a < c.stars.length,
        `${c.id} link [${a},${b}]: ${a} is not a star index in a ${c.stars.length}-star figure`,
      );
      assert.ok(
        Number.isInteger(b) && b >= 0 && b < c.stars.length,
        `${c.id} link [${a},${b}]: ${b} is not a star index in a ${c.stars.length}-star figure`,
      );
    }
  }
});

test('every hull entry resolves to a real catalogue star', () => {
  for (const [cid, index] of HULL) {
    const c = CONSTELLATIONS.find((k) => k.id === cid);
    assert.ok(c, `hull names a constellation "${cid}" that does not exist`);
    assert.ok(
      index >= 0 && index < c.stars.length,
      `hull entry [${cid}, ${index}] is outside a ${c.stars.length}-star figure`,
    );
  }
  // A hull that traces one ship comes back to where it started.
  exactly(HULL[0].join(','), HULL[HULL.length - 1].join(','), 'the hull closing on its first star');
});

test('every project anchor in projects.ts resolves to a real catalogue star', () => {
  const anchored = projects.filter((p) => p.anchor);
  atLeast(anchored.length, 4, 'projects carrying an anchor');
  for (const p of anchored) {
    assert.ok(starById(p.anchor), `${p.name} is anchored to "${p.anchor}", which is not in the catalogue`);
  }
});

test('easeOutCubic is anchored at both ends and monotonic across 100 samples', () => {
  exactly(easeOutCubic(0), 0, 'easeOutCubic(0)');
  exactly(easeOutCubic(1), 1, 'easeOutCubic(1)');
  let previous = 0;
  for (let i = 1; i <= 100; i += 1) {
    const v = easeOutCubic(i / 100);
    atLeast(v, previous, `easeOutCubic(${(i / 100).toFixed(2)}) against the sample before it`);
    previous = v;
  }
});

test('arrival delay is clamped to the documented maximum for an element far off screen', () => {
  // An element three viewports down the page reports a distance fraction well
  // past 1; the delay must stop at the clamp, not keep growing.
  exactly(computeArrival(3, 'full'), ARRIVAL.full.domClamp, 'full-sequence delay at 3x the maximum distance');
  exactly(computeArrival(1, 'full'), ARRIVAL.full.domClamp, 'full-sequence delay at exactly the maximum distance');
  atMost(computeArrival(3, 'brief'), ARRIVAL.brief.domClamp, 'brief-sequence delay at 3x the maximum distance', 's');
  // And it is monotonic below the clamp, because a nearer element must never
  // arrive after a farther one.
  atLeast(computeArrival(0.5, 'full'), computeArrival(0.1, 'full'), 'delay at frac 0.5 against frac 0.1');
  exactly(computeArrival(0, 'full'), ARRIVAL.full.waveStart, 'delay at the origin, which is the wave start itself');
});
