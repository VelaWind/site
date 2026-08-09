/**
 * The sky's facts: the star catalogue, the projection, and the arrival timing.
 *
 * This file is data and pure functions only — no DOM, no canvas — so Node can
 * import it directly and the tests can hold the geometry to account without a
 * browser. The name of this site is a catalogued object in the sky, and the
 * point of the background is that it is that sky, not an arrangement that
 * looked nice: every position below is a real star's right ascension and
 * declination, and nothing here may be nudged to improve the layout.
 */

/**
 * The window on the sky, in equatorial coordinates. Wide enough to hold all
 * three constellations of the old ship with margin, at a 1.5 aspect.
 */
export const WINDOW = { raMin: 6.15, raMax: 11.05, decTop: -20, decBottom: -73, aspect: 1.5 };

/**
 * The Vela pulsar: what is left of the supernova of roughly eleven thousand
 * years ago, and the origin of the arrival wave. The page is built by this
 * explosion, so its position is the one coordinate everything else radiates
 * from.
 */
export const PULSAR = { ra: 8.58, dec: -45.2 };

/**
 * Argo Navis, as the 1750s split it: the sails, the keel, the stern. Each
 * constellation keeps the colour token of the case-study family it anchors,
 * which is why a token name and not a colour lives here — the stylesheet owns
 * the palette, and this file only says which token a figure reads from.
 *
 * `m` is apparent magnitude, and it runs backwards: Canopus at -0.7 is the
 * second-brightest star in the night sky and must visibly be the brightest
 * thing up there.
 */
export const CONSTELLATIONS = [
  {
    id: 'vela',
    label: 'VELA — the sails',
    token: '--star',
    stars: [
      { id: 'gamma-velorum', name: 'γ Velorum', ra: 8.16, dec: -47.3, m: 1.8 },
      { id: 'delta-velorum', name: 'δ Velorum', ra: 8.74, dec: -54.7, m: 2.0 },
      { id: 'suhail', name: 'Suhail', ra: 9.13, dec: -43.4, m: 2.2 },
      { id: 'markeb', name: 'Markeb', ra: 9.37, dec: -55.0, m: 2.5 },
      { id: 'mu-velorum', name: 'μ Velorum', ra: 10.78, dec: -49.4, m: 2.7 },
      { id: 'psi-velorum', name: 'ψ Velorum', ra: 9.51, dec: -40.5, m: 3.6 },
    ],
    links: [
      [0, 1],
      [1, 3],
      [3, 4],
      [4, 5],
      [5, 2],
      [2, 0],
    ],
  },
  {
    id: 'carina',
    label: 'CARINA — the keel',
    token: '--sea',
    stars: [
      { id: 'canopus', name: 'Canopus', ra: 6.4, dec: -52.7, m: -0.7 },
      { id: 'miaplacidus', name: 'Miaplacidus', ra: 9.22, dec: -69.7, m: 1.7 },
      { id: 'avior', name: 'Avior', ra: 8.38, dec: -59.5, m: 1.9 },
      { id: 'aspidiske', name: 'Aspidiske', ra: 9.29, dec: -59.3, m: 2.2 },
      { id: 'theta-carinae', name: 'θ Carinae', ra: 10.72, dec: -64.4, m: 2.7 },
    ],
    links: [
      [0, 2],
      [2, 3],
      [3, 1],
      [1, 4],
    ],
  },
  {
    id: 'puppis',
    label: 'PUPPIS — the stern',
    token: '--vio',
    stars: [
      { id: 'naos', name: 'Naos', ra: 8.06, dec: -40.0, m: 2.3 },
      { id: 'pi-puppis', name: 'π Puppis', ra: 7.29, dec: -37.1, m: 2.7 },
      { id: 'rho-puppis', name: 'ρ Puppis', ra: 8.13, dec: -24.3, m: 2.8 },
      { id: 'tau-puppis', name: 'τ Puppis', ra: 6.83, dec: -50.6, m: 2.9 },
      { id: 'nu-puppis', name: 'ν Puppis', ra: 6.64, dec: -43.2, m: 3.2 },
    ],
    links: [
      [2, 0],
      [0, 1],
      [1, 4],
      [4, 3],
    ],
  },
];

/**
 * The ship itself: the three constellations traced as one hull, in drawing
 * order. Each entry names a constellation and a star index within it.
 */
export const HULL = [
  ['carina', 0],
  ['puppis', 3],
  ['puppis', 4],
  ['puppis', 1],
  ['puppis', 0],
  ['vela', 5],
  ['vela', 2],
  ['vela', 4],
  ['carina', 4],
  ['carina', 1],
  ['carina', 3],
  ['carina', 2],
  ['carina', 0],
];

/** Every star, flat, each carrying its constellation's id and token. */
export const STARS = CONSTELLATIONS.flatMap((c) =>
  c.stars.map((s) => ({ ...s, constellation: c.id, token: c.token })),
);

const BY_ID = new Map(STARS.map((s) => [s.id, s]));

/** A catalogue star by its id, or undefined: a missing anchor must not throw. */
export const starById = (id) => BY_ID.get(id);

/**
 * Sky coordinates to unit-box fractions.
 *
 * RA is flipped: right ascension runs eastward, and on a sky chart — a view
 * from inside the sphere, not a map of ground — east is to the LEFT. Without
 * the flip the whole ship is mirrored, invisible to most readers and instantly
 * wrong to anyone who knows the southern sky.
 */
export function fraction(ra, dec) {
  return {
    fx: 1 - (ra - WINDOW.raMin) / (WINDOW.raMax - WINDOW.raMin),
    fy: (dec - WINDOW.decTop) / (WINDOW.decBottom - WINDOW.decTop),
  };
}

/**
 * Where the sky box sits over a viewport: aspect 1.5, wider than the screen so
 * the figures bleed past the edges instead of floating inside a frame, centred.
 */
export function skyBox(vw, vh) {
  const w = Math.min(vw * 1.15, vh * 1.7);
  const h = w / WINDOW.aspect;
  return { x: (vw - w) / 2, y: (vh - h) / 2, w, h };
}

/** A star's position in viewport pixels, given the box from skyBox(). */
export function project(ra, dec, box) {
  const { fx, fy } = fraction(ra, dec);
  return { x: box.x + fx * box.w, y: box.y + fy * box.h };
}

/**
 * Star radius in CSS pixels from apparent magnitude. Magnitude runs backwards,
 * so brighter means a smaller m and a larger dot; the floor keeps the faintest
 * catalogue star a visible point rather than sub-pixel dust.
 */
export function starRadius(m) {
  return Math.max(0.9, 2.3 - m * 0.46);
}

/** The wave's easing. Deceleration is the entire effect: it arrives, it does not snap past. */
export function easeOutCubic(p) {
  return 1 - (1 - p) ** 3;
}

/**
 * Every duration of the arrival sequence, in seconds, in one place, so the
 * whole thing can be retuned by editing four numbers. `full` is the first load
 * of a browsing session; `brief` is every navigation after it — no pre-roll,
 * no bloom, the wave compressed, the DOM delays quartered.
 */
export const ARRIVAL = {
  full: { preroll: 0.55, bloom: 0.6, waveStart: 0.95, wave: 2.4, domScale: 1, domClamp: 1.6 },
  brief: { preroll: 0, bloom: 0, waveStart: 0, wave: 0.6, domScale: 0.25, domClamp: 0.4 },
};

/** How long before the front reaches a star it begins to light, and how long it takes. */
export const IGNITE = { lead: 0.14, duration: 0.9 };

/**
 * When the wave reaches a point at `frac` of the maximum distance from the
 * origin, as a CSS transition delay in seconds.
 *
 * Inverts r = maxDist * easeOutCubic(p): p = 1 - cbrt(1 - frac). Clamped to
 * the mode's maximum because an element far below the fold would otherwise
 * still be waiting when someone scrolls to it, which looks broken rather than
 * deliberate.
 */
export function computeArrival(frac, mode = 'full') {
  const m = ARRIVAL[mode];
  const f = Math.min(1, Math.max(0, frac));
  const p = 1 - Math.cbrt(1 - f);
  return Math.min(m.domClamp, m.domScale * (m.waveStart + m.wave * p));
}
