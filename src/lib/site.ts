/**
 * The handful of values that more than one file needs.
 *
 * The address used to live in src/pages/index.astro, which was fine while the
 * home page was the only thing that knew it. The command palette in the layout
 * needs it too, and two copies of an address is how one of them ends up stale.
 */

// PLACEHOLDER: replace with the real handle-based address before launch.
// It is the only invented value on the site.
export const EMAIL = 'hello@velawind.dev';

export const GITHUB = 'https://github.com/velawind';
