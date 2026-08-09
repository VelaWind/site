/**
 * The sky driver: the resting field, the arrival sequence, the tethers, and
 * the DOM reveal timings. Everything time-based lives here; everything factual
 * (positions, magnitudes, easings, durations) lives in catalog.js where Node
 * can test it.
 *
 * Colour never originates in this file. Every paint reads a token that the
 * stylesheet already owns, cached once per theme, so a palette change reaches
 * the canvas the same way it reaches everything else. The one literal below is
 * the documented fallback for a token that fails to resolve.
 */
import {
  ARRIVAL,
  CONSTELLATIONS,
  HULL,
  IGNITE,
  PULSAR,
  computeArrival,
  easeOutCubic,
  project,
  skyBox,
  starById,
  starRadius,
} from './catalog.js';

/*
 * The set of elements the wave switches on. The stylesheet carries the same
 * selector for the hidden state — keep the two in step, they are one decision
 * written in two grammars. .reveal is excluded because those sections already
 * have their own scroll-driven entry and two systems fighting over one
 * element's opacity helps nobody.
 */
const REVEAL_SELECTOR = '.site-header, .hero > *, main > :not(.hero):not(.reveal), .site-footer';

/* Geometry and alpha caps for the sequence and the resting sky. Times live in
 * catalog.js (ARRIVAL/IGNITE); these are the sizes and ceilings. */
const BLOOM_RADIUS = 260; // px, the core's full spread
const BLOOM_ALPHA = 0.42; // hard cap: it must never approach a white screen
const RING_ALPHA = 0.34;
const NEBULA_ALPHA = 0.03; // what the wave leaves behind, forever
const LINE_REACH = 250; // px, how close the pointer must be to raise a line
const LINE_ALPHA = 0.15;
const NAME_REACH = 28; // px, how close the pointer must be to name a star
const TETHER_ALPHA = 0.28;
const DRIFT = { x: 6, y: 4, px: 150, py: 200 }; // px and seconds, whole-sky sine drift
const PARALLAX = 0.005; // fraction of pointer offset from centre
const SCROLL_RISE = 0.06; // the sky rises at 6% of scroll distance
const SESSION_KEY = 'velawind-arrival';

/* The documented neutral: painted only if a token fails to resolve, which
 * means the stylesheet did not load or the token was renamed without this
 * file hearing about it. Grey, so the failure is visible but not garish. */
const FALLBACK = '#8a919c';

export function mountSky(canvas) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const root = document.documentElement;
  const still = matchMedia('(prefers-reduced-motion: reduce)');
  const fine = matchMedia('(pointer: fine)');

  let w = 0;
  let h = 0;
  let stars = []; // projected catalogue stars
  let field = []; // the background depth stars
  let origin = { x: 0, y: 0 };
  let maxDist = 1;
  let raf = 0;
  let t0 = 0; // performance.now() at sequence start, ms
  let arrived = false; // the sequence has finished (or never ran)
  let pointer = null;
  let tether = null; // { card, star } while a card is hovered/focused
  let velaLit = false; // the constellation egg: figures + hull at full
  let colours = {};
  let font = '10px monospace';
  let frameAcc = 0;
  let frameN = 0;

  /*
   * Which sequence runs. Reduced motion is not an abbreviation, it is an
   * absence: one static frame in the final state and no loop at all. The
   * session gate makes the full sequence a once-per-session event, so a
   * reader clicking between pages is not made to sit through it again.
   */
  let mode = 'brief';
  if (still.matches) {
    mode = 'skip';
  } else {
    try {
      mode = sessionStorage.getItem(SESSION_KEY) ? 'brief' : 'full';
      sessionStorage.setItem(SESSION_KEY, '1');
    } catch {
      mode = 'full'; // no storage: every load is a first load, which is honest
    }
  }

  const readTheme = () => {
    const cs = getComputedStyle(root);
    const token = (name) => cs.getPropertyValue(name).trim() || FALLBACK;
    colours = {
      '--star': token('--star'),
      '--sea': token('--sea'),
      '--vio': token('--vio'),
      sky: token('--sky-star'),
      skyAlpha: Number(cs.getPropertyValue('--sky-alpha')) || 1,
    };
    // The label font: size and family are tokens too, resolved to pixels by
    // reading the canvas's own computed style, because a calc() chain of rems
    // comes back unresolved from a custom property.
    const own = getComputedStyle(canvas);
    font = `${own.fontSize} ${own.fontFamily}`;
  };

  const init = () => {
    const box = canvas.getBoundingClientRect();
    w = box.width;
    h = box.height;
    // Capped at 2: past that the pixels cost real work and buy nothing a
    // reader can see on a field of one-pixel dots.
    const dpr = Math.min(2, devicePixelRatio || 1);
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const sky = skyBox(w, h);
    origin = project(PULSAR.ra, PULSAR.dec, sky);
    maxDist = Math.hypot(w, h);

    const igniteAt = (x, y) => {
      const m = ARRIVAL[mode === 'skip' ? 'brief' : mode];
      const frac = Math.min(1, Math.hypot(x - origin.x, y - origin.y) / maxDist);
      return m.waveStart + m.wave * (1 - Math.cbrt(1 - frac)) - IGNITE.lead;
    };

    stars = CONSTELLATIONS.flatMap((c) =>
      c.stars.map((s, i) => {
        const p = project(s.ra, s.dec, sky);
        return { ...s, ...p, r: starRadius(s.m), token: c.token, cid: c.id, index: i, ignite: igniteAt(p.x, p.y) };
      }),
    );

    /*
     * The depth field. Density by area, not width, so a tall window is not
     * emptier than a wide one; clamped so a phone still reads as a sky and a
     * cinema display does not become work.
     */
    const count = Math.max(60, Math.min(260, Math.round((w * h) / 7000)));
    field = Array.from({ length: count }, () => {
      const fx = Math.random();
      const fy = Math.random();
      return {
        fx,
        fy,
        r: 0.25 + Math.random() * 0.9,
        a: 0.06 + Math.random() * 0.3,
        rate: 0.0004 + Math.random() * 0.0011,
        phase: Math.random() * Math.PI * 2,
        z: 0.15 + Math.random() * 0.85, // depth: near stars answer the pointer most
        ignite: igniteAt(fx * w, fy * h),
      };
    });
  };

  /*
   * The DOM side of the wave. Each revealed element learns, once, when the
   * front reaches its centre; the transition itself is pure CSS reading
   * --arrival, so nothing here touches styles per frame. Setting the go flag
   * is what starts every clock, aligned with t0 below.
   */
  const assignArrivals = () => {
    if (!('arrive' in root.dataset) || 'arriveGo' in root.dataset) return;
    for (const el of document.querySelectorAll(REVEAL_SELECTOR)) {
      const box = el.getBoundingClientRect();
      const d = Math.hypot(box.left + box.width / 2 - origin.x, box.top + box.height / 2 - origin.y);
      el.style.setProperty('--arrival', `${computeArrival(d / maxDist, mode === 'full' ? 'full' : 'brief').toFixed(3)}s`);
    }
  };

  const go = () => {
    root.dataset.arriveGo = '';
  };

  /* How lit a thing is at time t, given when the wave reaches it. */
  const ignition = (at, t) =>
    arrived ? 1 : easeOutCubic(Math.min(1, Math.max(0, (t - at) / IGNITE.duration)));

  const distToSegment = (px_, py_, x1, y1, x2, y2) => {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len2 = dx * dx + dy * dy || 1;
    const u = Math.min(1, Math.max(0, ((px_ - x1) * dx + (py_ - y1) * dy) / len2));
    return Math.hypot(px_ - (x1 + u * dx), py_ - (y1 + u * dy));
  };

  const starOf = (cid, index) => stars.find((s) => s.cid === cid && s.index === index);

  const draw = (nowMs) => {
    const started = performance.now();
    const t = (nowMs - t0) / 1000;
    const m = ARRIVAL[mode === 'skip' ? 'brief' : mode];
    const settled = mode === 'skip' || t > m.waveStart + m.wave + IGNITE.duration;
    if (settled) arrived = true;

    ctx.clearRect(0, 0, w, h);

    /*
     * The whole sky moves together: a slow sine drift below the threshold of
     * conscious attention, a whisper of pointer parallax, and a rise at 6% of
     * scroll so the sky and the page are not welded together. All applied as
     * one translation rather than per star.
     */
    const driftX = mode === 'skip' ? 0 : DRIFT.x * Math.sin((2 * Math.PI * t) / DRIFT.px);
    const driftY = mode === 'skip' ? 0 : DRIFT.y * Math.sin((2 * Math.PI * t) / DRIFT.py);
    const parX = pointer ? (pointer.x - w / 2) * PARALLAX : 0;
    const parY = pointer ? (pointer.y - h / 2) * PARALLAX : 0;
    const rise = scrollY * SCROLL_RISE;
    ctx.save();
    ctx.translate(driftX + parX, driftY + parY - rise);

    // The depth field: present from the first frame at 18% — a dim sky before
    // anything happens, so the sequence is a sunrise rather than a bang.
    ctx.fillStyle = colours.sky;
    for (const f of field) {
      const lit = 0.18 + 0.82 * ignition(f.ignite, t);
      const twinkle = mode === 'skip' ? 1 : 0.7 + 0.3 * Math.sin(nowMs * f.rate + f.phase);
      ctx.globalAlpha = f.a * colours.skyAlpha * twinkle * lit;
      ctx.beginPath();
      ctx.arc(f.fx * w + parX * f.z, f.fy * h + parY * f.z, f.r, 0, Math.PI * 2);
      ctx.fill();
    }

    // Constellation lines: invisible at rest, raised only near the pointer —
    // or all of them, hull included, when the egg has lit the ship.
    const sky = skyBox(w, h);
    for (const c of CONSTELLATIONS) {
      ctx.strokeStyle = colours[c.token];
      ctx.lineWidth = 1;
      for (const [a, b] of c.links) {
        const s1 = starOf(c.id, a);
        const s2 = starOf(c.id, b);
        if (!s1 || !s2) continue;
        let alpha = 0;
        if (velaLit) alpha = 0.3;
        else if (pointer) {
          const d = distToSegment(pointer.x - parX, pointer.y - parY, s1.x, s1.y, s2.x, s2.y);
          if (d < LINE_REACH) alpha = LINE_ALPHA * (1 - d / LINE_REACH);
        }
        if (alpha <= 0) continue;
        ctx.globalAlpha = alpha * Math.min(ignition(s1.ignite, t), ignition(s2.ignite, t));
        ctx.beginPath();
        ctx.moveTo(s1.x, s1.y);
        ctx.lineTo(s2.x, s2.y);
        ctx.stroke();
      }
    }
    if (velaLit) {
      // The ship itself, the reason three constellations share one sky here.
      ctx.strokeStyle = colours['--star'];
      ctx.globalAlpha = 0.16;
      ctx.beginPath();
      HULL.forEach(([cid, index], i) => {
        const s = starOf(cid, index);
        if (!s) return;
        if (i === 0) ctx.moveTo(s.x, s.y);
        else ctx.lineTo(s.x, s.y);
      });
      ctx.stroke();
      ctx.globalAlpha = 0.55;
      ctx.font = font;
      for (const c of CONSTELLATIONS) {
        const anchor = starOf(c.id, 0);
        if (!anchor) continue;
        ctx.fillStyle = colours[c.token];
        ctx.fillText(c.label, anchor.x + 8, anchor.y - 8);
      }
    }

    // The catalogue. Born of the wave: each star begins lighting 140ms before
    // the front reaches it, so it brightens into the wave rather than being
    // switched on by it.
    for (const s of stars) {
      const a = ignition(s.ignite, t);
      if (a <= 0) continue;
      const hot = tether && tether.star.id === s.id;
      ctx.fillStyle = colours[s.token];
      if (s.m < 1 || hot) {
        // Canopus must visibly be the brightest thing up there; a bare 2.6px
        // dot is not visibly anything, so the brightest stars carry a halo.
        const halo = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, s.r * 5);
        halo.addColorStop(0, colours[s.token]);
        halo.addColorStop(1, 'transparent');
        ctx.globalAlpha = 0.25 * a;
        ctx.fillStyle = halo;
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r * 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = colours[s.token];
      }
      ctx.globalAlpha = (hot ? 1 : 0.85) * a;
      ctx.beginPath();
      ctx.arc(s.x, s.y, hot ? s.r * 1.4 : s.r, 0, Math.PI * 2);
      ctx.fill();

      const near =
        pointer && Math.hypot(pointer.x - parX - s.x, pointer.y - parY - s.y) < NAME_REACH;
      if ((near || hot) && a > 0.5) {
        ctx.globalAlpha = 0.8 * a;
        ctx.font = font;
        ctx.fillText(s.name, s.x + s.r + 5, s.y - s.r - 3);
      }
    }

    // The nebula the supernova left behind. It eases up as the wave passes
    // and then sits at 0.03 forever: the quietest thing on the page, and the
    // only one that is literally the site's name.
    const nebA = NEBULA_ALPHA * (arrived ? 1 : ignition(m.waveStart, t));
    if (nebA > 0.001) {
      const nr = Math.min(w, h) * 0.3;
      const neb = ctx.createRadialGradient(origin.x, origin.y, 0, origin.x, origin.y, nr);
      neb.addColorStop(0, colours['--star']);
      neb.addColorStop(1, 'transparent');
      ctx.globalAlpha = nebA;
      ctx.fillStyle = neb;
      ctx.beginPath();
      ctx.arc(origin.x, origin.y, nr, 0, Math.PI * 2);
      ctx.fill();
    }

    // The arrival itself: core bloom, then the shockwave.
    if (!arrived && mode !== 'skip') {
      const bloomP = m.bloom ? Math.min(1, Math.max(0, (t - m.preroll) / m.bloom)) : 0;
      if (bloomP > 0) {
        // Fades back out as the wave carries the energy away.
        const decay = Math.max(0, 1 - Math.max(0, t - (m.preroll + m.bloom)) / m.wave);
        const br = BLOOM_RADIUS * easeOutCubic(bloomP);
        const bloom = ctx.createRadialGradient(origin.x, origin.y, 0, origin.x, origin.y, Math.max(1, br));
        bloom.addColorStop(0, colours['--star']);
        bloom.addColorStop(1, 'transparent');
        ctx.globalAlpha = BLOOM_ALPHA * easeOutCubic(bloomP) * decay;
        ctx.fillStyle = bloom;
        ctx.beginPath();
        ctx.arc(origin.x, origin.y, Math.max(1, br), 0, Math.PI * 2);
        ctx.fill();
      }

      const waveP = (t - m.waveStart) / m.wave;
      if (waveP > 0 && waveP < 1) {
        const r = maxDist * easeOutCubic(waveP);
        ctx.strokeStyle = colours['--star'];
        // Two strokes, no more: the front, and one soft echo behind it.
        ctx.globalAlpha = (RING_ALPHA / 3) * (1 - waveP);
        ctx.lineWidth = 6;
        ctx.beginPath();
        ctx.arc(origin.x, origin.y, Math.max(1, r * 0.92), 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = RING_ALPHA * (1 - waveP);
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(origin.x, origin.y, Math.max(1, r), 0, Math.PI * 2);
        ctx.stroke();
      }
    }

    ctx.restore();

    // The tether: drawn in viewport space, because the card is a DOM box and
    // the curve has to end where the card actually is right now.
    if (tether) {
      const box = tether.card.getBoundingClientRect();
      const sx = box.left + box.width / 2;
      const sy = box.top;
      const star = stars.find((s) => s.id === tether.star.id);
      if (star && sy > 0) {
        const tx = star.x + driftX + parX;
        const ty = star.y + driftY + parY - rise;
        ctx.strokeStyle = colours[star.token];
        ctx.globalAlpha = TETHER_ALPHA;
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 6]);
        ctx.lineDashOffset = -((nowMs / 40) % 9); // the dashes travel toward the star
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        // The control point bows the curve away from the straight line, so it
        // reads as a thread thrown upward rather than a ruler laid down.
        ctx.quadraticCurveTo((sx + tx) / 2 + (ty - sy) * 0.12, (sy + ty) / 2 - (tx - sx) * 0.08, tx, ty);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }

    ctx.globalAlpha = 1;

    // The frame budget is a number in a report, not a feeling: accumulate and
    // publish every 120 frames where a test or a human can read it.
    frameAcc += performance.now() - started;
    frameN += 1;
    if (frameN >= 120) {
      canvas.dataset.frameMs = (frameAcc / frameN).toFixed(2);
      frameAcc = 0;
      frameN = 0;
    }
  };

  const loop = (nowMs) => {
    draw(nowMs);
    raf = requestAnimationFrame(loop);
  };

  const start = () => {
    cancelAnimationFrame(raf);
    raf = 0;
    if (mode === 'skip') {
      // One static frame in the final state, and no loop, ever.
      arrived = true;
      draw(t0 + 1e7);
    } else {
      raf = requestAnimationFrame(loop);
    }
  };

  readTheme();
  init();
  t0 = performance.now();
  assignArrivals();
  go();
  start();

  /* ------------------------------------------------------------- listeners */

  if (fine.matches && !still.matches) {
    addEventListener('pointermove', (e) => {
      pointer = { x: e.clientX, y: e.clientY };
    }, { passive: true });
    document.addEventListener('pointerleave', () => {
      pointer = null;
    });
  }

  // The tether answers focus as well as hover: it is the only thing on the
  // page that explains why the sky is there, and a keyboard user is entitled
  // to find it.
  const findAnchor = (el) => {
    const card = el && el.closest ? el.closest('.card[data-anchor]') : null;
    if (!card) return null;
    const star = starById(card.dataset.anchor);
    return star ? { card, star } : null; // a project without an anchor has no tether
  };
  document.addEventListener('mouseover', (e) => {
    const next = findAnchor(e.target);
    if (next) tether = next;
    else if (tether && !tether.card.matches(':hover, :focus-within')) tether = null;
    if (mode === 'skip') draw(t0 + 1e7);
  });
  document.addEventListener('focusin', (e) => {
    tether = findAnchor(e.target) || tether;
    if (mode === 'skip') draw(t0 + 1e7);
  });
  document.addEventListener('focusout', () => {
    if (tether && !tether.card.matches(':hover, :focus-within')) {
      tether = null;
      if (mode === 'skip') draw(t0 + 1e7);
    }
  });

  // The constellation egg, kept from the sky this one replaced: the palette
  // row and the footer button still light the ship.
  const setVela = (on) => {
    velaLit = on;
    if (!raf) draw(t0 + 1e7);
  };
  document.addEventListener('vela:light', () => setVela(true));
  document.addEventListener('vela:toggle', () => setVela(!velaLit));

  // Nothing to animate for a tab nobody is looking at. On return the arrival
  // is not replayed: the reader left mid-sentence, not mid-cinema.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      cancelAnimationFrame(raf);
      raf = 0;
    } else {
      arrived = true;
      start();
    }
  });

  let resizeTimer = 0;
  addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      init();
      // Mid-sequence, the wave's map of the page has changed under it; the
      // delays are re-measured so nothing waits for a front that already
      // passed its new position.
      assignArrivals();
      if (!raf) draw(t0 + 1e7);
    }, 150);
  });

  // A theme change rewrites the tokens; re-read and, without a loop, repaint.
  const retheme = () => {
    readTheme();
    if (!raf) draw(t0 + 1e7);
  };
  new MutationObserver(retheme).observe(root, { attributeFilter: ['data-theme'] });
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', retheme);

  still.addEventListener('change', () => {
    mode = still.matches ? 'skip' : 'brief';
    arrived = true;
    start();
  });
}
