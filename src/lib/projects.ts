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
   * a line and not a paragraph on purpose: the index is a list to scan, and
   * the case study is where the argument goes.
   */
  blurb: string;
  /** The route of the case study, which must already be a page in src/pages. */
  href: string;
}

export const projects: Project[] = [
  {
    name: 'Lodestar',
    blurb: 'Interactive astrophysics, explained in seven layers you choose to open.',
    href: '/projects/lodestar',
  },
  {
    name: 'Vela Sea',
    blurb: 'A maritime simulator whose simulation layer runs, and is tested, with no window open.',
    href: '/projects/vela-sea',
  },
];
