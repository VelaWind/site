/**
 * The case studies that exist, in the order they appear at /projects.
 *
 * This array is the index. Adding a project is adding an entry here, and the
 * only rule is that its page has to exist first: /projects is the sole route
 * that links into the case studies, so an entry whose page has not been
 * written yet is a dead link with nothing else on the site to soften it. An
 * absent project is invisible; a broken one is a broken site.
 */
export interface Project {
  /** The name, as it should read in the list. */
  name: string;
  /**
   * One line saying what it is, for a reader deciding whether to click. It is
   * a line and not a paragraph on purpose: the card is a thing to scan, and
   * the case study is where the argument goes.
   */
  blurb: string;
  /** The route of the case study, which must already be a page in src/pages. */
  href: string;
  /**
   * What it is built with, shortest recognisable name each. Four or so: the
   * point is to let a reader place the project in a language and a domain at a
   * glance, and a full dependency list does that worse than four names do.
   * Every tag here has to be true of the repository, not aspirational.
   */
  tags: string[];
  /**
   * Which colour identifies this project, by token name. Not a decoration: the
   * palette assigns one meaning per colour, so `star` is Lodestar and `sea` is
   * Vela Sea, and a card cannot borrow a colour that already means something
   * else. A new project needs its own hue in global.css rather than a
   * second-hand one. See the colour block there.
   */
  accent: 'star' | 'sea' | 'sky' | 'vio';
  /**
   * Whether a reader can open the thing itself right now, as opposed to
   * reading about it. Optional, because "no badge" is the honest state for a
   * project that is only a case study, and a badge that says nothing is worse
   * than no badge.
   */
  status?: 'live' | 'playable' | 'wip';
}

export const projects: Project[] = [
  {
    name: 'Lodestar',
    blurb: 'Interactive astrophysics, explained in seven layers you choose to open.',
    href: '/projects/lodestar',
    tags: ['React', 'TypeScript', 'Canvas 2D', 'KaTeX'],
    accent: 'star',
    status: 'live',
  },
  {
    name: 'Vela Sea',
    blurb: 'A maritime simulator whose simulation layer runs, and is tested, with no window open.',
    href: '/projects/vela-sea',
    tags: ['Python', 'Pygame', 'pytest', 'pygbag'],
    accent: 'sea',
    status: 'playable',
  },
];

/**
 * Badge wording, kept next to the type it belongs to so a new status cannot be
 * added without deciding what it says on screen.
 */
export const STATUS_LABEL: Record<NonNullable<Project['status']>, string> = {
  live: 'Live',
  playable: 'Playable',
  wip: 'In progress',
};
