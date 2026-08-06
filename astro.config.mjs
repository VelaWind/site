// @ts-check
import { defineConfig } from 'astro/config';

// Static output. No integrations: no UI framework, no Tailwind, no analytics.
// Nothing here opts a page into client-side JavaScript, and no page uses a
// `client:` directive, so both routes ship as HTML and CSS only.
export default defineConfig({
  site: 'https://velawind.dev',
  output: 'static',
  build: {
    // One directory per route with an index.html, so /projects/lodestar has no
    // trailing-slash ambiguity on a static host.
    format: 'directory',
  },
});
