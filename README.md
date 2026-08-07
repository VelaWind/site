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
