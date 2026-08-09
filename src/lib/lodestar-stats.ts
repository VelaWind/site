/**
 * The home page's Lodestar figures, verified against the Lodestar README at
 * build time.
 *
 * These numbers are quoted facts — a reader takes "324 tests" as true today,
 * not as true when somebody last edited the page — and they used to be typed
 * by hand with nothing comparing them, the same silent-divergence class the
 * social card had. The source of truth was already in the build: the case
 * study fetches this README, and a build that cannot reach it already fails.
 *
 * They are CHECKED rather than derived, deliberately. The README states each
 * figure mid-sentence in prose, so deriving the displayed number would mean
 * letting a regex read prose onto the front page: anchored one sentence too
 * loosely it derives the wrong number silently, and a rephrase in another
 * repository would be editing this site's hero. A check has the opposite
 * failure mode — any drift, in the number or the phrasing, stops the build
 * with a message naming both sides. A red build that a human resolves beats
 * a page that edits itself.
 *
 * Each claim pins the sentence it relies on with a regex whose one capture is
 * the value the README states today. When Lodestar's numbers move, the build
 * fails, and the fix is to update `figure` here (the label lives with it) so
 * the page and the README agree again. When Lodestar rephrases the sentence,
 * the build fails naming the pattern, and the fix is to re-anchor `proof`.
 *
 * This runs during the build, not at test time, so it adds no network fetch
 * to the suite: it rides the same single request the case study already
 * makes (see fetchReadme), and when GitHub is unreachable the build was
 * already failing on that request before this file existed.
 */
import { fetchReadme } from './case-study-readme';
import { projectByHref } from './projects';

export interface Stat {
  figure: string;
  label: string;
}

interface Claim extends Stat {
  /** Matches the README sentence the figure is quoted from; the one capture is today's value. */
  proof: RegExp;
}

const CLAIMS: Claim[] = [
  { figure: '324', label: 'tests in Lodestar', proof: /`npm test` is (\d+) Vitest tests/ },
  { figure: '33', label: 'physics sanity checks', proof: /the (\d+) physics sanity checks as assertions/ },
  { figure: '7', label: 'layers per topic', proof: /Every topic is one page of ([a-z]+|\d+) layers/ },
];

/*
 * The README writes small numbers as words ("seven layers"); the stat shows a
 * digit. Enough of the words to cover any figure this table would plausibly
 * hold — an unlisted word falls through unchanged and fails the comparison
 * loudly, which is the correct outcome for a number this map cannot vouch for.
 */
const AS_DIGIT: Record<string, string> = {
  one: '1', two: '2', three: '3', four: '4', five: '5', six: '6',
  seven: '7', eight: '8', nine: '9', ten: '10', eleven: '11', twelve: '12',
};

/** The three verified stats, or a failed build with the disagreement named. */
export async function lodestarStats(): Promise<Stat[]> {
  const readme = await fetchReadme({
    owner: 'VelaWind',
    repo: 'lodestar',
    branch: projectByHref('/projects/lodestar')?.branch,
    expectedHeading: '# Lodestar',
  });

  for (const claim of CLAIMS) {
    const match = readme.match(claim.proof);
    if (!match) {
      throw new Error(
        `[lodestar-stats] the home page quotes "${claim.figure} ${claim.label}", but no sentence in ` +
          `the Lodestar README matches ${claim.proof} any more — the phrasing changed, or the claim is gone. ` +
          `Read the README, then update the figure and re-anchor the proof pattern in src/lib/lodestar-stats.ts. ` +
          `This build fails rather than publishing a number nothing vouches for.`,
      );
    }
    const stated = AS_DIGIT[match[1]] ?? match[1];
    if (stated !== claim.figure) {
      throw new Error(
        `[lodestar-stats] the home page says "${claim.figure} ${claim.label}"; the Lodestar README now ` +
          `says "${match[1]}" (in: ${JSON.stringify(match[0])}). Update the figure in ` +
          `src/lib/lodestar-stats.ts to match the README. This build fails rather than publishing a stale number.`,
      );
    }
  }

  return CLAIMS.map(({ figure, label }) => ({ figure, label }));
}
