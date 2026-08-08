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

## Project screenshots

A card shows a real screenshot when one exists and the accent-tinted panel when
one does not, so the projects can be captured one at a time. Adding a picture is
two steps: put the file in `src/assets/projects/`, then name it in
`src/lib/projects.ts` with its alt text. A file named there and missing from
disk stops the build rather than serving a card with a hole in it.

**Capture to this spec.**

| | |
|---|---|
| Dimensions | **2560 × 1440**, from a **1280 × 720** viewport captured at 2× |
| Aspect ratio | **Exactly 16:9.** Anything else is cropped from the centre |
| Format | **PNG**, lossless, straight from the capture |
| Minimum | 1400 px wide. Below that the largest variant is upscaled |
| Filename | The project in kebab-case: `lodestar.png`, `vela-sea.png` |

The viewport size is the part that is easy to get wrong. The panel is 671 CSS px
across at its widest — measured, at a 720px viewport, the last width before the
grid takes a second column — and about 345px on the home page's three-column
line. A 2560px-wide *screenshot of a 2560px-wide window* shrinks to a quarter
size in that panel and its text becomes unreadable specks. Capturing a 1280px
viewport at 2× gives the same file size with the layout of an ordinary laptop,
which is legible at card size and is also what the software actually looks like
to most people using it. 16:9 is not a preference: the panel is
`aspect-ratio: 16 / 9` and `object-fit: cover` will crop whatever does not match.

**What belongs in frame:**

- The software doing the thing it is for. A simulation mid-run, a parameter
  moved off its default, a page of real content. Not an empty state, not a
  landing page, not a login screen, not settings.
- The app's dark theme if it has one. The card sits on a dark surface, and a
  white screenshot in a dark card is a rectangle of glare.
- Nothing but the app. No browser chrome, address bar, bookmarks, tab strip,
  extension icons, OS taskbar, mouse cursor, or scrollbar. Capture the viewport,
  not the window.
- Nothing personal. No real name, no email, no signed-in account, no avatar, no
  file path with a username in it. Same rule as everywhere else here.
- The interesting part away from the edges, because the panel crops from the
  centre when a capture is not exactly 16:9.

**Then write the alt text**, in the same entry. It describes what is happening on
the screen, not what the project is called — the name is the heading directly
below it, and a screen reader that says "Lodestar, Lodestar, interactive
astrophysics" has been told nothing by the middle one:

```ts
image: {
  file: 'lodestar.png',
  alt: 'A dark reading page headed "Space, explained in layers you choose to '
    + 'open", with a depth control set to Curious and cards for escape '
    + 'velocity, Kepler orbits and black holes below it.',
},
```

**What it costs.** The build emits AVIF and WebP at 350, 700 and 1400 px wide
and a browser fetches exactly one of them. Measured with a real 1600 × 900
screenshot of the Lodestar deploy, on `/projects`:

| | Before | After |
|---|---|---|
| HTML | 16,829 B | 17,547 B |
| CSS | 16,915 B | 17,009 B |
| Image | — | 11,716 B at 1×, 31,916 B at 2× |
| **Total** | **33,744 B** | **46,272 B at 1×, 66,472 B at 2×** |

One screenshot roughly doubles the page on a retina screen, and it is still
under 70 KB — smaller than a single web font, which this site also does not
have. The image is what the page weighs now; the rest is rounding.

## Unfurls

Every route carries its own Open Graph and Twitter tags, written once in
`src/layouts/Base.astro` from the `title` and `description` each page already
passes, so a shared case study unfurls as that case study rather than as the
front page. Case studies pass `type="article"`; everything else is a website.

`public/og.png` is the 1200×630 card, and it is drawn by
`node scripts/make-og-image.js` — headless Chrome rendering `src/styles/global.css`,
so the card is the site's own tokens rather than a hand-matched copy of them in
an image editor. Rerun it after changing a colour or a type step. The output is
committed, because a card changes about once a year and making every deploy
depend on an installed browser would be a poor trade for that.

`sitemap.xml` is a route (`src/pages/sitemap.xml.ts`) rather than an
integration; it takes its case-study URLs from `src/lib/projects.ts`, so a new
one appears without anybody remembering. `@astrojs/sitemap` was considered and
turned down: five packages, transitively, to print four URLs.

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
