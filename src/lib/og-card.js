/**
 * The one line the social card says, and the alt text that describes it.
 *
 * One home on purpose, because this line exists in three places that used to
 * be three copies: drawn into the committed PNG by scripts/make-og-image.js,
 * rendered as the home page's lede, and quoted by the unfurl's image alt on
 * every route. The card shipped stale exactly once — the lede changed, the
 * PNG kept saying the old thing, and nothing compared them.
 *
 * Now the generator and the alt both read this constant, the generator bakes
 * the line into the PNG as a tEXt chunk, and test/og-card.test.js fails the
 * suite when the page, this constant, and the committed image disagree.
 *
 * To change the line: edit it here AND in the home page's lede
 * (src/pages/index.astro), then re-run
 *
 *   node scripts/make-og-image.js
 *
 * and commit the regenerated PNG alongside the text.
 *
 * A .js file rather than .ts because scripts/make-og-image.js is plain Node
 * with no build step, and Node cannot import TypeScript.
 */
export const OG_LEDE =
  'Four projects, each answerable to something outside itself: SI constants, ' +
  'the maritime collision rules, database constraints, the filesystem.';

export const OG_IMAGE_ALT =
  'The VelaWind wordmark in light type on a dark field, above the line: ' +
  OG_LEDE;
