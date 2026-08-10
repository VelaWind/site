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

## Case-study screenshots

The project cards always run their live canvas scenes; a real screenshot goes
on the project's case-study page, in the slot under the lede. The split is a
measurement, not a taste: the card panel is about 345 CSS px on the home
page's multi-column line, and a screenshot shrunk to that is unreadable
specks, while the case-study column holds a flat 544 CSS px from a 600px
viewport up — the one place on the site where a picture of software is big
enough to read. Until a project has a screenshot, the built page renders
nothing there; only `astro dev` shows a placeholder box, for judging the
layout before a capture exists.

Adding a picture is two steps: put the file in `src/assets/projects/`, then
name it in `src/lib/projects.ts` under `screenshot` with its alt text. A file
named there and missing from disk stops the build rather than serving a page
with a hole in it, and a `screenshot` on a project whose `caseStudy` is false
stops the build too, because it would render nowhere and nothing would say so.

**Capture to this spec.**

| | |
|---|---|
| Dimensions | **2176 × 1224**, from a **1088 × 612** viewport captured at 2× |
| Aspect ratio | **Exactly 16:9.** Anything else is cropped from the centre |
| Format | **PNG**, lossless, straight from the capture |
| Minimum | 1120 px wide. Below that the largest variant is upscaled |
| Filename | The project in kebab-case: `lodestar.png`, `vela-sea.png` |

The viewport size follows from the column, not from precedent. The slot shows
the picture at up to 544 CSS px, so a 1088px viewport is displayed at one
half — about the scale at which an ordinary app layout stays legible — and
capturing it at 2× gives the 1088 device pixels a retina screen asks for.
16:9 is not a preference: the slot is `aspect-ratio: 16 / 9` and
`object-fit: cover` will crop whatever does not match.

**What belongs in frame:**

- The software doing the thing it is for. A simulation mid-run, a parameter
  moved off its default, a page of real content. Not an empty state, not a
  landing page, not a login screen, not settings.
- The app's dark theme if it has one. The slot sits on a dark page, and a
  white screenshot there is a rectangle of glare.
- Nothing but the app. No browser chrome, address bar, bookmarks, tab strip,
  extension icons, OS taskbar, mouse cursor, or scrollbar. Capture the
  viewport, not the window.
- Nothing personal. No real name, no email, no signed-in account, no avatar,
  no file path with a username in it. Same rule as everywhere else here.
- The interesting part away from the edges, because the slot crops from the
  centre when a capture is not exactly 16:9.

**Then write the alt text**, in the same entry — one field, so a picture
cannot be added without describing it. It describes what is happening on the
screen, not what the project is called; the name is the page's own h1:

```ts
screenshot: {
  file: 'lodestar.png',
  alt: 'A dark reading page headed "Space, explained in layers you choose to '
    + 'open", with a depth control set to Curious and cards for escape '
    + 'velocity, Kepler orbits and black holes below it.',
},
```

**What it costs.** The build emits AVIF and WebP at 560, 1120 and 1680 px wide
and a browser fetches exactly one. When this slot was a card slot, one real
1600 × 900 capture measured 11.7 KB at 1× and 31.9 KB at 2× as AVIF — the
larger emitted widths here will land in the same tens-of-kilobytes range,
still smaller than the web font this site does not have.

## Unfurls

Every route carries its own Open Graph and Twitter tags, written once in
`src/layouts/Base.astro` from the `title` and `description` each page already
passes, so a shared case study unfurls as that case study rather than as the
front page. Case studies pass `type="article"`; everything else is a website.

`src/assets/og.png` is the 1200×630 card, and it is drawn by
`node scripts/make-og-image.js` — headless Chrome rendering `src/styles/global.css`,
so the card is the site's own tokens rather than a hand-matched copy of them in
an image editor. Rerun it after changing a colour, a type step, or the card's
line in `src/lib/og-card.js` — that constant is the line's one home, shared by
the generator, the home lede it must match, and the image alt on every route,
and `test/og-card.test.js` fails the suite when the three drift. The generator
also writes the line into the PNG as a `tEXt` Description chunk, which is how
the test knows what the committed pixels were drawn from. The output is
committed, because a card changes about once a year and making every deploy
depend on an installed browser would be a poor trade for that.

The card goes through the asset pipeline rather than `public/`, so its URL
carries a content hash and changes whenever the image does — the only way a
new picture moves through HTTP caches already holding the old one. `/og.png`,
the address before the hashing, still serves the current card's bytes via
`src/pages/og.png.ts`, so shared links do not 404. None of this reaches into
a scraper's own stored preview: LinkedIn, Slack and the rest keep their copy
until their own expiry or a manual re-scrape.

`sitemap.xml` is a route (`src/pages/sitemap.xml.ts`) rather than an
integration; it takes its case-study URLs from `src/lib/projects.ts`, so a new
one appears without anybody remembering. `@astrojs/sitemap` was considered and
turned down: five packages, transitively, to print four URLs.

## JavaScript

Every route ships script now — the sky sees to that — but the guarantee
underneath is unchanged: no route needs script to be read, navigated or used,
and everything below is vanilla, first-party, and dependency-free.

What runs, and why each piece exists:

- **One render-blocking inline script** in the head, and it is the only thing
  allowed to block: it puts the stored theme on the root before first paint
  (the alternative is the white flash), and it arms the arrival sequence. The
  arming matters more than the animation. The reveal styles default to
  VISIBLE; the hidden pre-reveal state is keyed to an attribute only this
  script sets, and only when `prefers-reduced-motion` allows motion — so a
  reader with JavaScript off, a crawler, a print job and a reduced-motion
  reader all get the finished page with nothing to un-hide. The same script
  arms a 4-second failsafe that forces the final state whatever happens
  afterwards, so a script error cannot make the site invisible.
- **The sky module** (`src/scripts/sky/`, ~9 KB minified): the star field, the
  real Vela–Carina–Puppis catalogue, the supernova arrival, and the card
  tethers, on one canvas. Every colour it paints is read from the stylesheet's
  tokens, not from a second palette in JS. Under reduced motion it draws one
  static frame and runs no loop at all; a hidden tab pauses it.
- **The card scenes** (`src/components/ProjectCard.astro` driving
  `src/scripts/sky/scenes.js`): four pure functions on one shared
  `requestAnimationFrame` loop, stopped entirely for off-screen cards by an
  IntersectionObserver. The same component keeps the spotlight script, which
  writes the pointer position into two custom properties — the one thing here
  CSS cannot express — and everything it feeds sits behind
  `prefers-reduced-motion`, `hover: hover` and `pointer: fine`.
- **Deferred site chrome**: the theme toggle, the command palette (a native
  `<dialog>`, so the focus trap and Escape are the browser's), and the eggs.
  Every control that needs script is hidden until script reveals it, so a
  reader without JavaScript is never shown a dead button.

## Tests

`npm test` builds the site, serves the built output, drives a real headless
Chrome over the DevTools Protocol, and tears both down again — 55 tests in
twelve files. It needs nothing installed that is not already here: Node has a global
WebSocket and a global fetch, and CDP is JSON over one socket, so the harness
and runner are about five hundred lines in `test/`. Chrome itself has to exist
on the machine; set `CHROME_PATH` if it is somewhere unusual.

One file per concern, named for what it protects:

| File | What it guards |
|---|---|
| `print.test.js` | Nothing that carries content prints invisible. |
| `still-under-reduced-motion.test.js` | Under `reduce`, nothing declares motion and successive frames are identical, canvas included. |
| `contrast-aa.test.js` | Every declared text and background pair, both schemes, all four routes, against 4.5:1 (3:1 for large text). |
| `contrast-rendered.test.js` | The worst rendered pixel behind each measured text block clears 4.5:1 — sky and scrim included, which the declared pairs cannot see. |
| `keyboard-order.test.js` | Every tab stop is on screen and shows focus; the palette traps focus and gives it back. |
| `works-without-javascript.test.js` | Every link works, no section is invisible, no layout collapses, and no dead control is painted. |
| `palette.test.js` | Filtering, selection, activation, and that every action has a plain equivalent elsewhere. |
| `og-card.test.js` | The social card cannot go stale silently: the home lede, the alt on every route, and the text baked into the committed PNG all equal the card line in `src/lib/og-card.js`, and the hashed `og:image` URL and legacy `/og.png` both serve the committed bytes at the declared size. |
| `sky.test.js` | Canvas geometry, the devicePixelRatio cap, the area-based field-star law, the ship egg lighting and dimming, and that a star's hover hot spot sits on its painted pixels — scrolled and at the viewport edge. |
| `sky-math.test.js` | The projection against the real catalogue, with no browser: the east-is-left RA flip, radius monotonic in magnitude, every link, hull entry and project anchor resolving, the easing, and the arrival-delay clamp. |
| `scenes.test.js` | The four card scenes as pure functions: hostile boxes and times without throwing, `globalAlpha` handed back, and that each actually paints. |
| `arrival.test.js` | With scripts disabled the lede is fully visible; under `reduce` no animation loop runs; on a cold load the lede is readable within 2.2s of navigation. |

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
marker is removed, `src/lib/case-study-readme.ts` throws and the build stops. A
page quietly serving a stale architecture section is the failure this is meant
to prevent.

The home page's stat figures ride the same fetch. The three Lodestar numbers
(tests, sanity checks, layers per topic) are hand-written in
`src/lib/lodestar-stats.ts` next to a regex that must find each one in the
fetched README, and every build verifies them: a README that no longer agrees
fails the build naming both values. Checked rather than derived, because the
README states them mid-sentence in prose, and a regex that reads prose onto
the front page can be silently wrong about which sentence it read — a red
build a human resolves cannot. No network is added anywhere: the check shares
the case study's single request, and an unreachable GitHub already failed the
build before the check existed. The fourth figure, the public repository
count, is still counted by hand; its source is the GitHub account, and the
unauthenticated API's per-IP rate limit would make a shared build runner fail
red for reasons that are not faults.

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
