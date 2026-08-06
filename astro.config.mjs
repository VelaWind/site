// @ts-check
import { defineConfig } from 'astro/config';

// Static output. No integrations: no UI framework, no Tailwind, no analytics.
// Nothing here opts a page into client-side JavaScript, and no page uses a
// `client:` directive, so both routes ship as HTML and CSS only.
export default defineConfig({
  site: 'https://velawind.dev',
  output: 'static',
  // Astro's HTML compressor collapses a whitespace run that spans a newline to
  // nothing rather than to a single space. So a paragraph whose line ends in a
  // word and whose next line starts with an inline tag silently loses the space
  // between them, and the Lodestar page shipped reading "onto`document.body`",
  // "at the end of`<body>`" and "from the[Lodestar README]".
  //
  // Wrapping prose to a column is normal, the source looks correct, and nothing
  // fails: the damage is only visible on the built page. Every future paragraph
  // that happens to wrap before a <code> or <a> is the same bug again.
  //
  // Turning it off costs 322 bytes across both routes (15018 -> 15340), and 41
  // bytes once gzipped (6636 -> 6677), because whitespace is exactly what a
  // compressor is best at. That is not a price worth a class of silent typos.
  compressHTML: false,
  build: {
    // One directory per route with an index.html, so /projects/lodestar has no
    // trailing-slash ambiguity on a static host.
    format: 'directory',
  },
});
