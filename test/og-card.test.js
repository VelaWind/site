/**
 * The social card, held to the site it unfurls for.
 *
 * The defect this guards was found the expensive way: the home lede changed
 * and the committed og.png kept saying the old thing, because the card is a
 * PNG a script has to be re-run to redraw and nothing compared the two. Same
 * class as the README fetch and the screenshot checks — a published artefact
 * must not be able to diverge silently from its source of truth.
 *
 * Three parties have to say the same line: src/lib/og-card.js (which the
 * generator draws and the alt attributes quote), the lede rendered on the
 * built home page, and the committed PNG itself, which carries the text it
 * was drawn from in a tEXt Description chunk written by the generator.
 * Comparison is over meaningful text — whitespace normalised, and the page
 * side read via textContent so markup the lede may grow never enters into it.
 */
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { BASE, PAGES, openPage, exactly } from './harness.js';
import { OG_LEDE } from '../src/lib/og-card.js';

const PNG_PATH = new URL('../src/assets/og.png', import.meta.url);
const RERUN = 'to fix, change the texts together and re-run `node scripts/make-og-image.js`, then commit the PNG';

const norm = (s) => s.replace(/\s+/g, ' ').trim();

/** Every tEXt chunk in a PNG, keyword to value. ~15 lines beats a dependency. */
function pngTexts(buf) {
  const texts = {};
  // 8 signature bytes, then chunks of length + type + data + CRC.
  for (let off = 8; off + 12 <= buf.length; ) {
    const length = buf.readUInt32BE(off);
    const type = buf.toString('latin1', off + 4, off + 8);
    if (type === 'tEXt') {
      const data = buf.subarray(off + 8, off + 8 + length);
      const nul = data.indexOf(0);
      texts[data.toString('latin1', 0, nul)] = data.toString('latin1', nul + 1);
    }
    off += 12 + length;
  }
  return texts;
}

test('the home lede and the image alt both say the card line', async (t) => {
  const page = await openPage();
  t.after(() => page.close());
  await page.emulate();

  await page.goto('/');
  const lede = await page.evaluate(`document.querySelector('.hero .lede').textContent`);
  exactly(
    norm(lede),
    norm(OG_LEDE),
    `the built home lede against OG_LEDE in src/lib/og-card.js — the page and the card have drifted; ${RERUN}`,
  );

  for (const path of PAGES) {
    await page.goto(path, 400);
    const alts = await page.json(`({
      og: document.querySelector('meta[property="og:image:alt"]')?.content ?? '',
      tw: document.querySelector('meta[name="twitter:image:alt"]')?.content ?? '',
    })`);
    for (const [name, alt] of [['og:image:alt', alts.og], ['twitter:image:alt', alts.tw]]) {
      exactly(
        norm(alt).includes(norm(OG_LEDE)),
        true,
        `${name} on ${path} quoting the card line from src/lib/og-card.js (measured "${alt}") — ${RERUN}`,
      );
    }
  }
});

test('the committed PNG was drawn from the line the generator holds now', () => {
  const png = readFileSync(PNG_PATH);
  const drawn = pngTexts(png).Description;
  exactly(
    typeof drawn,
    'string',
    'a tEXt Description chunk in src/assets/og.png, which the generator writes — this PNG predates provenance; re-run `node scripts/make-og-image.js` and commit it',
  );
  exactly(
    norm(drawn),
    norm(OG_LEDE),
    `the text baked into src/assets/og.png against OG_LEDE in src/lib/og-card.js — the committed card is stale; ${RERUN}`,
  );
});

test('og:image is absolute, content-hashed, and serves the committed bytes', async (t) => {
  const page = await openPage();
  t.after(() => page.close());
  await page.emulate();
  await page.goto('/');

  const meta = await page.json(`({
    image: document.querySelector('meta[property="og:image"]').content,
    twitter: document.querySelector('meta[name="twitter:image"]').content,
    width: document.querySelector('meta[property="og:image:width"]').content,
    height: document.querySelector('meta[property="og:image:height"]').content,
  })`);

  exactly(meta.twitter, meta.image, 'twitter:image against og:image, which must name the same file');
  exactly(/^https:\/\//.test(meta.image), true, `og:image being absolute (measured "${meta.image}") — scrapers discard relative image URLs`);
  const pathname = new URL(meta.image).pathname;
  exactly(
    /^\/_astro\/og\.[A-Za-z0-9_-]{6,}\.png$/.test(pathname),
    true,
    `og:image carrying a content hash in its path (measured "${pathname}") — an unhashed address cannot move a new card through caches that hold the old one`,
  );

  // The declared dimensions are read out of the PNG's own header, so the tags
  // cannot promise a size the file does not have.
  const committed = readFileSync(PNG_PATH);
  exactly(Number(meta.width), committed.readUInt32BE(16), 'og:image:width against the width in the committed PNG header');
  exactly(Number(meta.height), committed.readUInt32BE(20), 'og:image:height against the height in the committed PNG header');

  // Both addresses — hashed and the pre-hashing /og.png — must serve exactly
  // the committed file. A transform anywhere in the pipeline would strip the
  // provenance chunk and quietly decouple the test above from what ships.
  for (const [name, path] of [['the hashed asset', pathname], ['the legacy /og.png', '/og.png']]) {
    const served = Buffer.from(await (await fetch(BASE + path)).arrayBuffer());
    exactly(served.equals(committed), true, `${name} at ${path} being byte-identical to the committed src/assets/og.png`);
  }
});
