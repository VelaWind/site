/**
 * The Lodestar case-study body, fetched from the repository README at build time.
 *
 * The prose has one home. It is written in the Lodestar README, between two
 * HTML comment markers, and rendered here. Editing it in the repository is the
 * only way to change what this site shows, which is the point: a committed copy
 * in this repo would be a second home for the same words and would go stale the
 * first time the README moved.
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
 */
import { get } from 'node:https';
import { marked } from 'marked';

const README_URL =
  'https://raw.githubusercontent.com/VelaWind/lodestar/main/README.md';

const START_MARKER = '<!-- site:case-study:start -->';
const END_MARKER = '<!-- site:case-study:end -->';

const TIMEOUT_MS = 20_000;
const MAX_REDIRECTS = 3;

/** Prefixed so the reason is obvious in a Vercel build log. */
function fail(reason: string): never {
  throw new Error(
    `[lodestar-readme] ${reason}\n` +
      `  source: ${README_URL}\n` +
      `  expected markers: ${START_MARKER} ... ${END_MARKER}\n` +
      `  This build fails rather than serving a stale or partial case study.`,
  );
}

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

export async function fetchCaseStudySection(): Promise<CaseStudySection> {
  let result: HttpResult;
  try {
    result = await request(README_URL);
  } catch (cause) {
    fail(`could not reach the README: ${(cause as Error).message}`);
  }

  if (result.status !== 200) {
    fail(`request returned HTTP ${result.status} ${result.statusText}`.trimEnd());
  }

  const readme = result.body;

  // A repository that has gone private, or a path that no longer exists, can
  // still answer with a body. Check that this is the README rather than
  // trusting the status code alone.
  if (!readme.startsWith('# Lodestar')) {
    fail(
      'the response does not look like the Lodestar README ' +
        `(first 80 characters: ${JSON.stringify(readme.slice(0, 80))})`,
    );
  }

  const start = readme.indexOf(START_MARKER);
  if (start === -1) fail('the start marker is missing from the README');

  const end = readme.indexOf(END_MARKER);
  if (end === -1) fail('the end marker is missing from the README');

  if (end <= start) fail('the end marker appears before the start marker');

  const markdown = readme.slice(start + START_MARKER.length, end).trim();
  if (markdown.length === 0) fail('the section between the markers is empty');

  const html = await marked.parse(markdown, { async: true, gfm: true });

  return { html, sourceUrl: README_URL };
}
