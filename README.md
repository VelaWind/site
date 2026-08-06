# velawind.dev

Personal site. Astro, TypeScript, plain CSS. No UI framework, no CSS framework,
no analytics, and no client-side JavaScript on any route.

## Routes

| Route | What it is |
|---|---|
| `/` | Stub: handle, one line, links out. |
| `/projects` | Index of the case studies that exist. |
| `/projects/lodestar` | Case study for [Lodestar](https://github.com/VelaWind/lodestar). |

The index is generated from `src/lib/projects.ts`. Adding a project is adding an
entry to that array, once its case study page exists: `/projects` is the only
route that links into the case studies, so an entry without a page is a dead
link.

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
