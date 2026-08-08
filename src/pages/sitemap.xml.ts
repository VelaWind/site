/**
 * The sitemap, written by hand rather than by an integration.
 *
 * @astrojs/sitemap would do this, and it was checked before being turned down:
 * it brings zod, sitemap and stream-replace-string, and sitemap brings arg and
 * sax behind it. That is five packages to print four URLs onto a page, against
 * a repository whose entire runtime dependency list is astro and marked. The
 * whole file below is shorter than the install would be.
 *
 * The routes are not a hardcoded list either. The two static ones are named
 * here; the case studies come from the same array the pages are generated from,
 * so a new case study appears in the sitemap without anybody remembering to
 * come back and add it.
 *
 * No lastmod. The honest value would be when the page's content last changed,
 * and nothing here records that; the build date is not it, and a date that says
 * "today" on every crawl after every deploy is worse than no date at all.
 */
import type { APIRoute } from 'astro';
import { caseStudies } from '../lib/projects';

export const GET: APIRoute = ({ site }) => {
  const origin = site ?? new URL('https://velawind.dev');

  const routes = ['/', '/projects', ...caseStudies.map((project) => project.href)];

  const urls = routes
    .map((route) => `  <url><loc>${new URL(route, origin).href}</loc></url>`)
    .join('\n');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`;

  return new Response(xml, {
    headers: { 'content-type': 'application/xml; charset=utf-8' },
  });
};
