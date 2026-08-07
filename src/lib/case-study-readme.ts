/**
 * A case-study body, fetched from a repository README at build time.
 *
 * The prose has one home. It is written in the project's own README, between
 * two HTML comment markers, and rendered here. Editing it in the repository is
 * the only way to change what this site shows, which is the point: a committed
 * copy in this repo would be a second home for the same words and would go
 * stale the first time the README moved.
 *
 * Every failure here is fatal. If the network is down, if the file moves, if the
 * repository goes private, or if either marker is removed or reordered, this
 * throws and the build stops. There is deliberately no cached copy and no
 * fallback string: a page that quietly serves last month's architecture section
 * is worse than a build that fails, because nobody finds out.
 *
 * The request goes through `node:https` with `agent: false` rather than through
 * `fetch`. `fetch` keeps the socket in a pool for a reuse that never comes, and
 * on Windows that still-closing handle trips a libuv assertion while Astro tears
 * the build down: every file is written, then the process aborts and the build
 * reports failure. A build that always exits non-zero cannot fail loudly, since
 * there is no longer any difference between a broken fetch and a good one, so
 * the connection is managed explicitly here instead.
 *
 * This module takes the repository as an argument rather than naming one. There
 * are two case studies now and there will be more, and a per-project copy of
 * this file is the same duplication the whole approach exists to avoid.
 */
import { get } from 'node:https';
import { marked } from 'marked';

const START_MARKER = '<!-- site:case-study:start -->';
const END_MARKER = '<!-- site:case-study:end -->';

const TIMEOUT_MS = 20_000;
const MAX_REDIRECTS = 3;

export interface CaseStudySource {
  /** GitHub owner, e.g. "VelaWind". */
  owner: string;
  /** Repository name, e.g. "lodestar". */
  repo: string;
  /**
   * Branch to read. Pinned by the caller rather than defaulted, because a URL
   * that works by redirect today is a silent staleness bug the day the
   * repository grows the branch it was redirecting from.
   */
  branch: string;
  /**
   * The README's first line. A repository that has gone private, or a path that
   * no longer exists, can still answer with a body; this checks the response is
   * the README rather than trusting the status code alone.
   */
  expectedHeading: string;
}

/** Raw file root for a source, with the trailing slash. */
function rawBase({ owner, repo, branch }: CaseStudySource): string {
  return `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/`;
}

function readmeUrl(source: CaseStudySource): string {
  return `${rawBase(source)}README.md`;
}

/** Prefixed so the reason is obvious in a Vercel build log. */
function fail(source: CaseStudySource, reason: string): never {
  throw new Error(
    `[case-study-readme: ${source.owner}/${source.repo}] ${reason}\n` +
      `  source: ${readmeUrl(source)}\n` +
      `  expected markers: ${START_MARKER} ... ${END_MARKER}\n` +
      `  This build fails rather than serving a stale or partial case study.`,
  );
}

/*
 * ---------------------------------------------------------------- images ----
 *
 * An image path in a README is relative to the repository root, because that is
 * where GitHub renders it. Rendered on this site, `screenshots/04-storm.png`
 * resolves against /projects/ and 404s. The Lodestar span happens to contain no
 * images, so this went unnoticed until the Vela Sea architecture section, which
 * ends with one.
 *
 * The rewrite is by repository rather than by a hardcoded prefix: veritas and
 * anchorfile will each have their own, and a per-project constant here is a
 * per-project thing to forget.
 *
 * Only images are rewritten. A relative *link* in a fetched span is left alone
 * and will not resolve, so spans should link with absolute URLs; that is a
 * smaller and more visible failure than silently rewriting every link target.
 */

/** True for anything already resolvable on its own: scheme, protocol-relative, or fragment. */
function isAbsoluteUrl(url: string): boolean {
  return /^[a-z][a-z0-9+.-]*:/i.test(url) || url.startsWith('//') || url.startsWith('#');
}

function toRawUrl(url: string, base: string): string {
  if (isAbsoluteUrl(url)) return url;
  // A leading slash in a README is still repository-root relative, not host-root.
  const path = url.replace(/^\.\//, '').replace(/^\//, '');
  return base + path;
}

/**
 * Point every relative image in `markdown` at the repository's raw host.
 *
 * Covers both spellings a README uses: Markdown `![alt](path "title")` and a raw
 * `<img src="path">`, which GitHub also renders. Exported so it can be exercised
 * directly rather than only through a network fetch.
 */
export function rewriteRelativeImageUrls(markdown: string, source: CaseStudySource): string {
  const base = rawBase(source);

  // ![alt](path) or ![alt](<path with spaces>), each with an optional title.
  // The angled form is a separate branch rather than an optional <>, because a
  // path containing a space is only legal inside the brackets and a pattern that
  // stops at whitespace would skip exactly those, silently.
  const markdownImage =
    /(!\[[^\]]*\]\()\s*(?:<([^>]*)>|([^)\s]+))(\s+(?:"[^"]*"|'[^']*'|\([^)]*\)))?\s*(\))/g;
  // <img ... src="path" ...>, quotes either way.
  const htmlImage = /(<img\b[^>]*?\bsrc\s*=\s*)(["'])([^"']*)\2/gi;

  return markdown
    .replace(
      markdownImage,
      (
        _m,
        open: string,
        angled: string | undefined,
        bare: string | undefined,
        title: string | undefined,
        close: string,
      ) => {
        const url = angled ?? bare ?? '';
        const rewritten = toRawUrl(url, base);
        // Keep the brackets when they were there: the space that required them
        // survives the rewrite and would break the link without them.
        const target = angled === undefined ? rewritten : `<${rewritten}>`;
        return `${open}${target}${title ?? ''}${close}`;
      },
    )
    .replace(htmlImage, (_m, open: string, quote: string, url: string) =>
      `${open}${quote}${toRawUrl(url, base)}${quote}`);
}

/* ----------------------------------------------------------------- fetch --- */

interface HttpResult {
  status: number;
  statusText: string;
  body: string;
}

function request(url: string, redirectsLeft = MAX_REDIRECTS): Promise<HttpResult> {
  return new Promise<HttpResult>((resolve, reject) => {
    const req = get(
      url,
      {
        // One request, then done. No connection pool to outlive the build.
        agent: false,
        headers: {
          'user-agent': 'velawind.dev build (+https://github.com/VelaWind/site)',
          accept: 'text/plain, */*',
        },
      },
      (res) => {
        const status = res.statusCode ?? 0;
        const location = res.headers.location;

        // GitHub answers this URL directly today. Following a redirect keeps a
        // future move from failing the build for a reason that is not a fault.
        if (status >= 300 && status < 400 && location) {
          res.resume();
          if (redirectsLeft === 0) {
            reject(new Error(`too many redirects (last: ${status} to ${location})`));
            return;
          }
          resolve(request(new URL(location, url).href, redirectsLeft - 1));
          return;
        }

        res.setEncoding('utf8');
        let body = '';
        res.on('data', (chunk: string) => {
          body += chunk;
        });
        res.on('end', () => {
          resolve({ status, statusText: res.statusMessage ?? '', body });
        });
        res.on('error', reject);
      },
    );

    req.on('error', reject);
    req.setTimeout(TIMEOUT_MS, () => {
      req.destroy(new Error(`no response within ${TIMEOUT_MS} ms`));
    });
  });
}

export interface CaseStudySection {
  /** The section between the markers, rendered to HTML. */
  html: string;
  /** Source URL, shown on the page so the provenance is visible to a reader. */
  sourceUrl: string;
}

export async function fetchCaseStudySection(source: CaseStudySource): Promise<CaseStudySection> {
  const url = readmeUrl(source);

  let result: HttpResult;
  try {
    result = await request(url);
  } catch (cause) {
    fail(source, `could not reach the README: ${(cause as Error).message}`);
  }

  if (result.status !== 200) {
    fail(source, `request returned HTTP ${result.status} ${result.statusText}`.trimEnd());
  }

  const readme = result.body;

  if (!readme.startsWith(source.expectedHeading)) {
    fail(
      source,
      `the response does not start with ${JSON.stringify(source.expectedHeading)} ` +
        `(first 80 characters: ${JSON.stringify(readme.slice(0, 80))})`,
    );
  }

  const start = readme.indexOf(START_MARKER);
  if (start === -1) fail(source, 'the start marker is missing from the README');

  const end = readme.indexOf(END_MARKER);
  if (end === -1) fail(source, 'the end marker is missing from the README');

  if (end <= start) fail(source, 'the end marker appears before the start marker');

  const markdown = readme.slice(start + START_MARKER.length, end).trim();
  if (markdown.length === 0) fail(source, 'the section between the markers is empty');

  const html = await marked.parse(rewriteRelativeImageUrls(markdown, source), {
    async: true,
    gfm: true,
  });

  return { html, sourceUrl: url };
}
