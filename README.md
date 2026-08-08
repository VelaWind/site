# velawind.dev

Personal site. Astro, TypeScript, plain CSS. No UI framework, no CSS framework,
no analytics, and no runtime dependencies.

## Routes

| Route | What it is |
|---|---|
| `/` | Header, hero, stats, selected work, currently building, about, contact. |
| `/projects` | Index of the case studies that exist. |
| `/projects/lodestar` | Case study for [Lodestar](https://github.com/VelaWind/lodestar). |
| `/projects/vela-sea` | Case study for [Vela Sea](https://github.com/VelaWind/vela-sea). |

Both project routes are generated from `src/lib/projects.ts`, through one card
component, so they cannot disagree about the same project. Adding a project is
adding an entry to that array. `/projects` lists only entries whose `caseStudy`
is true, because it is the way into the case studies and an entry there without
a page behind it is a dead link; the home page lists all of them, because a
project with no write-up yet is still work and its repository is a real
destination.

## JavaScript

There is one script, and it is on the two routes that show project cards. It
writes the pointer position into two custom properties so the card spotlight can
follow the cursor, which is the one thing here that CSS cannot express: there is
no pointer position to read in CSS. It is about fifteen lines, inline, no
dependencies, and it lives in `src/components/ProjectCard.astro`.

Everything it feeds is behind `prefers-reduced-motion`, `hover: hover` and
`pointer: fine` in the stylesheet, so it drives nothing for a reader who has
asked for stillness or is on a touch screen. With JavaScript off the gradient
falls back to its centre position and the rest of the site is unchanged: no
route needs script to be read, navigated or used.

`/projects/lodestar` and `/projects/vela-sea` ship zero script tags.

## Tests

`npm test` builds the site, serves the built output, drives a real headless
Chrome over the DevTools Protocol, and tears both down again. It needs nothing
installed that is not already here: Node has a global WebSocket and a global
fetch, and CDP is JSON over one socket, so the whole harness is `node --test`
and about two hundred lines in `test/`. Chrome itself has to exist on the
machine; set `CHROME_PATH` if it is somewhere unusual.

One file per concern, named for what it protects:

| File | What it guards |
|---|---|
| `print.test.js` | Nothing that carries content prints invisible. |
| `still-under-reduced-motion.test.js` | Under `reduce`, nothing declares motion and successive frames are identical, canvas included. |
| `contrast-aa.test.js` | Every text and background pair, both schemes, all four routes, against 4.5:1 (3:1 for large text). |
| `keyboard-order.test.js` | Every tab stop is on screen and shows focus; the palette traps focus and gives it back. |
| `works-without-javascript.test.js` | Every link works, no section is invisible, no layout collapses, and no dead control is painted. |
| `palette.test.js` | Filtering, selection, activation, and that every action has a plain equivalent elsewhere. |
| `sky.test.js` | Canvas geometry, the devicePixelRatio cap, and the constellation. |

Print runs first, on its own, because it caught the one defect that was
invisible in every browser check: the sections revealed by a scroll timeline
printed at opacity 0, since paper cannot be scrolled. Every assertion states the
threshold it defends and prints the measured number, so a failure reads
`expected 4.5:1, measured 4.31:1 for .card-blurb (#a1a9b0 on #161b21)` rather
than `expected true, got false`.

### What is not guarded

There is no copy snapshot, and that is deliberate. Lodestar has one because it
carries a lot of prose that changes underneath it and a silent rewrite there is
a real risk. Four pages do not need every word pinned: the snapshot would fail
on every edit, the failure would always be expected, and a test that is always
expected to fail teaches everyone to ignore it.

Also not covered: visual regression, real screen readers, browsers other than
Chromium, and the READMEs that two case studies fetch at build time. That last
one is guarded differently — the fetch has no committed fallback, so a missing
file or a moved marker fails the build rather than serving a stale page.

## The case study body is not stored here

`/projects/lodestar` fetches
`https://raw.githubusercontent.com/VelaWind/lodestar/main/README.md` at build
time and renders the section between these two markers:

```
<!-- site:case-study:start -->
<!-- site:case-study:end -->
```

The prose has one home, in the Lodestar repository. There is no committed copy
and no fallback: if the fetch fails, the repository goes private, or either
marker is removed, `src/lib/lodestar-readme.ts` throws and the build stops. A
page quietly serving a stale architecture section is the failure this is meant
to prevent.

The framing above the provenance note on that page (the problem, why the
obvious approach did not work, the trade-off) is written in the page itself,
because it is portfolio framing rather than repository documentation.

## Local

```bash
npm install
npm run dev      # localhost:4321
npm run build    # astro check, then a static build into dist/ (needs network)
npm run preview  # serve dist/
```

The build needs network access, because that is when the README is fetched.

## Licence

MIT (see LICENSE).
