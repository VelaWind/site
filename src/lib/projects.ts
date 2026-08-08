/**
 * Every project the site shows, in the order it shows them.
 *
 * One array, two surfaces. /projects lists only the entries with a case study,
 * because that route is the way into the case studies and an entry there
 * without a page behind it is a dead link. The home page shows all of them,
 * because a project with no case study written yet is still work, and its
 * repository is a real destination rather than a missing one.
 *
 * Adding a project is adding an entry here. Nothing else needs an edit.
 */
export interface Project {
  /** The name, as it should read on a card. */
  name: string;
  /**
   * One line saying what it is, for a reader deciding whether to click. It is
   * a line and not a paragraph on purpose: the card is a thing to scan, and
   * the case study is where the argument goes.
   */
  blurb: string;
  /**
   * Where the card goes: the case study when there is one, the public
   * repository when there is not. Never a route that does not exist.
   */
  href: string;
  /**
   * Whether `href` is a case study on this site. Drives which entries /projects
   * lists, and lets a card say where it is about to send a reader, since "read
   * the case study" and "here is the source" are different promises.
   */
  caseStudy: boolean;
  /**
   * What it is built with, shortest recognisable name each. Four or so: the
   * point is to place the project in a language and a domain at a glance, and
   * a full dependency list does that worse than four names do. Every tag has
   * to be true of the repository, not aspirational.
   */
  tags: string[];
  /**
   * Which colour identifies this project, by token name. Optional, and the
   * absence is deliberate: the palette gives each colour exactly one meaning,
   * so there is no spare hue to hand out. A project with no colour of its own
   * gets a neutral panel rather than borrowing one that already means
   * something else. Giving these a colour means adding a hue in global.css.
   */
  accent?: 'star' | 'sea';
  /**
   * A real screenshot of the software, if one has been taken.
   *
   * Optional, and the absence is the ordinary state rather than a gap waiting
   * to be filled: a card without one falls back to the tinted panel, so the
   * projects can gain pictures one at a time and the ones not yet captured go
   * on looking finished rather than looking broken.
   *
   * The file lives in src/assets/projects/ and is named here rather than
   * imported, so adding a picture stays an edit to this array and nothing else.
   * Capture it to the spec in the README; a file named here that is not on disk
   * fails the build rather than serving a card with a hole in it.
   *
   * The alt text is required alongside the file, which is why this is one field
   * and not two. Whether an image needs a description is a decision somebody
   * has to make, and making the picture impossible to add without also writing
   * the sentence is cheaper than remembering to come back for it.
   */
  image?: {
    /** Filename inside src/assets/projects/, extension included. */
    file: string;
    /**
     * What the software is doing in this frame. Not the project's name: that
     * is the heading immediately below, and a screen reader announcing
     * "Lodestar, Lodestar, interactive astrophysics..." has been told nothing
     * by the middle one. Describe the screen.
     */
    alt: string;
  };
  /** The repository's default branch. Not every repo calls it main. */
  branch?: string;
  /**
   * Whether a reader can open the thing itself right now, as opposed to
   * reading about it. Optional, because "no badge" is the honest state for
   * anything whose availability does not reduce to one word, and a badge that
   * says nothing is worse than no badge.
   */
  status?: 'live' | 'playable' | 'wip';
}

export const projects: Project[] = [
  {
    name: 'Lodestar',
    blurb: 'Interactive astrophysics, explained in seven layers you choose to open.',
    href: '/projects/lodestar',
    caseStudy: true,
    tags: ['React', 'TypeScript', 'Canvas 2D', 'KaTeX'],
    accent: 'star',
    status: 'live',
  },
  {
    name: 'Vela Sea',
    blurb: 'A maritime simulator whose simulation layer runs, and is tested, with no window open.',
    href: '/projects/vela-sea',
    caseStudy: true,
    tags: ['Python', 'Pygame', 'pytest', 'pygbag'],
    accent: 'sea',
    status: 'playable',
  },
  {
    name: 'Veritas',
    blurb: 'A catalogue of knowledge claims where Postgres enforces the rules, not the application.',
    href: 'https://github.com/VelaWind/veritas',
    caseStudy: false,
    branch: 'master',
    tags: ['Next.js', 'PostgreSQL', 'Supabase', 'TypeScript'],
  },
  {
    name: 'Anchorfile',
    blurb: 'A command-line tool that reads a repository and writes the context file an AI agent needs.',
    href: 'https://github.com/VelaWind/anchorfile',
    caseStudy: false,
    tags: ['TypeScript', 'Node', 'commander', 'npm'],
  },
];

/** The entries /projects is allowed to list. */
export const caseStudies = projects.filter((p) => p.caseStudy);

/**
 * Badge wording, kept next to the type it belongs to so a new status cannot be
 * added without deciding what it says on screen.
 */
export const STATUS_LABEL: Record<NonNullable<Project['status']>, string> = {
  live: 'Live',
  playable: 'Playable',
  wip: 'In progress',
};

/**
 * Status to colour token. Both reachable states share --live because the
 * palette gives that colour one meaning, "can be opened now", and a playable
 * build and a deployed site are both that. Anything still ahead is --vio.
 */
export const STATUS_TOKEN: Record<NonNullable<Project['status']>, string> = {
  live: '--live',
  playable: '--live',
  wip: '--vio',
};

/** The entry for a route, so a page can read its own project's data. */
export const projectByHref = (href: string): Project | undefined =>
  projects.find((project) => project.href === href);
