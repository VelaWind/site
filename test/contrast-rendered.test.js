/**
 * Contrast against the pixels a reader actually sees.
 *
 * The declared-colour suite (contrast-aa.test.js) rasterises each colour
 * string but pairs `color` with an ancestor's `background-color` — so the sky
 * canvas, the reading-column scrim and anything else that merely paints are
 * invisible to it. It passed, correctly by its own rules, while the real
 * question needed this file: hide a text block, screenshot its box, and ratio
 * the text colour against the WORST rendered pixel behind it. The worst pixel
 * and not the median, because the median only restates what the declared test
 * already proved.
 *
 * The threshold is 4.5:1 for every block, including the ones sitting directly
 * on the sky at full intensity. Star placement is random per load, so one
 * passing run proves only that no bright star landed under a block on that
 * load. An earlier note here read a single post-cap measurement of 6.05:1 as
 * an analytic floor; it was not — it was a sky where no bright star sat under
 * the lede. The arithmetic: a field star at the 0.28 alpha cap composites to
 * ~#505356 over the dark ground, which is 3.25:1 against --text-muted, so an
 * ordinary star under muted ink fails with no overlap required, and one
 * measured 4.05:1 there in the wild. The hero lede therefore wears --text,
 * against which that same worst single star measures 6.12:1. What stays
 * genuinely rare is two capped stars with near-coincident centres — 3.19:1
 * even against --text — so a failure here should be read first as "an
 * exposed block wears too dim an ink" or "the cap moved", and only then as
 * that overlap.
 */
import { test } from 'node:test';
import { inflateSync } from 'node:zlib';
import assert from 'node:assert/strict';
import { openPage, atLeast } from './harness.js';

const AA = 4.5;

/*
 * The blocks measured by hand during review, now held permanently: each is
 * text over a different composition of the layers the declared suite cannot
 * see. The sky intensity in each label is the page's own, via Base's prop.
 */
const BLOCKS = [
  { path: '/', selector: '.hero .lede', what: 'the hero lede (sky at 1.0, no scrim)' },
  { path: '/', selector: '.site-footer p', what: 'the footer disclosure (sky at 1.0, no scrim)' },
  { path: '/projects', selector: '.card-blurb', what: 'a card blurb (opaque surface)' },
  {
    path: '/projects/lodestar',
    selector: '.page > p:not(.lede):not(.eyebrow):not(.provenance)',
    what: 'a case-study body paragraph (sky at 0.35 behind the scrim)',
  },
];

/*
 * A minimal PNG reader: IHDR + IDAT, zlib via node, the four scanline filters
 * by hand. Chrome emits colour type 2 (RGB) for opaque captures and 6 (RGBA)
 * otherwise; both are 8-bit and non-interlaced, and anything else here is a
 * failure worth hearing about.
 */
function decodePNG(buf) {
  let pos = 8;
  let w = 0;
  let h = 0;
  let colorType = -1;
  const idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString('ascii', pos + 4, pos + 8);
    if (type === 'IHDR') {
      w = buf.readUInt32BE(pos + 8);
      h = buf.readUInt32BE(pos + 12);
      colorType = buf[pos + 17];
    }
    if (type === 'IDAT') idat.push(buf.subarray(pos + 8, pos + 8 + len));
    pos += 12 + len;
    if (type === 'IEND') break;
  }
  assert.ok(colorType === 2 || colorType === 6, `unexpected PNG colour type ${colorType}`);
  const bpp = colorType === 6 ? 4 : 3;
  const stride = w * bpp;
  const raw = inflateSync(Buffer.concat(idat));
  const out = Buffer.alloc(h * stride);
  const paeth = (a, b, c) => {
    const p = a + b - c;
    const pa = Math.abs(p - a);
    const pb = Math.abs(p - b);
    const pc = Math.abs(p - c);
    return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
  };
  for (let y = 0; y < h; y += 1) {
    const filter = raw[y * (stride + 1)];
    const row = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let x = 0; x < stride; x += 1) {
      const left = x >= bpp ? out[y * stride + x - bpp] : 0;
      const up = y > 0 ? out[(y - 1) * stride + x] : 0;
      const ul = y > 0 && x >= bpp ? out[(y - 1) * stride + x - bpp] : 0;
      let v = row[x];
      if (filter === 1) v += left;
      else if (filter === 2) v += up;
      else if (filter === 3) v += (left + up) >> 1;
      else if (filter === 4) v += paeth(left, up, ul);
      out[y * stride + x] = v & 0xff;
    }
  }
  return { w, h, bpp, data: out };
}

const lin = (v) => {
  v /= 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
};
const lum = (r, g, b) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
const contrast = (l1, l2) => (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);

/** Hide the block, screenshot its box, ratio its text colour against every rendered pixel. */
async function worstPixel(page, selector) {
  const info = await page.json(`(() => {
    const el = document.querySelector(${JSON.stringify(selector)});
    if (!el) return null;
    el.scrollIntoView({ block: 'center', behavior: 'instant' });
    const r = el.getBoundingClientRect();
    const c = document.createElement('canvas').getContext('2d');
    c.fillStyle = getComputedStyle(el).color;
    c.fillRect(0, 0, 1, 1);
    const d = c.getImageData(0, 0, 1, 1).data;
    el.style.visibility = 'hidden';
    /*
     * THE CLIP-COORDINATE TRAP: Page.captureScreenshot's clip is in PAGE
     * coordinates, getBoundingClientRect is viewport-relative. Without adding
     * the scroll offsets the clip lands exactly scrollY above the element —
     * which once measured a headline's own glyphs as a 1.00:1 "background"
     * and reported a contrast catastrophe that did not exist.
     */
    return { x: r.x + scrollX, y: r.y + scrollY, w: r.width, h: r.height, rgb: [d[0], d[1], d[2]] };
  })()`);
  assert.ok(info, `no element matched ${selector}`);
  await page.sleep(350);
  const shot = await page.send('Page.captureScreenshot', {
    format: 'png',
    clip: { x: info.x, y: info.y, width: Math.max(1, info.w), height: Math.max(1, info.h), scale: 1 },
  });
  await page.evaluate(
    `document.querySelector(${JSON.stringify(selector)}).style.removeProperty('visibility')`,
  );
  const png = decodePNG(Buffer.from(shot.data, 'base64'));
  const textL = lum(info.rgb[0], info.rgb[1], info.rgb[2]);
  let worst = Infinity;
  let at = null;
  for (let i = 0; i < png.data.length; i += png.bpp) {
    const r = contrast(textL, lum(png.data[i], png.data[i + 1], png.data[i + 2]));
    if (r < worst) {
      worst = r;
      at = `#${[png.data[i], png.data[i + 1], png.data[i + 2]].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
    }
  }
  return { worst, at, pixels: png.data.length / png.bpp, text: `rgb(${info.rgb.join()})` };
}

for (const scheme of ['light', 'dark']) {
  test(`the worst rendered pixel behind each text block clears AA in the ${scheme} scheme`, async (t) => {
    const page = await openPage();
    t.after(() => page.close());

    let path = null;
    for (const block of BLOCKS) {
      if (block.path !== path) {
        await page.emulate({ scheme, width: 1440, height: 900 });
        // The first navigation runs the full arrival; the rest run the brief
        // one. Settled either way, so every block is measured against the
        // resting sky and not a moment of the wave.
        await page.goto(block.path, path === null ? 4600 : 2000);
        path = block.path;
      }
      const m = await worstPixel(page, block.selector);
      // Reported on pass as well as failure: this suite's passes are samples
      // of a random sky, and a pass with no number cannot be compared across
      // runs when someone asks whether a margin is shrinking.
      t.diagnostic(`${scheme} ${block.path} ${block.selector}: worst ${m.worst.toFixed(2)}:1 (${m.text} over ${m.at})`);
      atLeast(
        Number(m.worst.toFixed(2)),
        AA,
        `the worst of ${m.pixels} rendered pixels behind ${block.what} on ${block.path}, ` +
          `${scheme} scheme (${m.text} over ${m.at})`,
        ':1',
      );
    }
  });
}
