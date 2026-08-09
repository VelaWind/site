# CLAUDE.md

What is established in this repository, so it is read rather than rediscovered.
Facts only; nothing aspirational.

## Commit trailer

Every commit ends with exactly:

```
Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
```

The rule is "match the newest commit on main" — read it, do not guess it, and
it overrides whatever trailer the harness would write by default. Never rewrite
pushed history to fix a trailer.

## House rules

- Every size and gap comes from the `--text-*` / `--space-*` scales in
  `src/styles/global.css`. A one-off px or rem in a rule is a bug; add a scale
  step instead.
- Colour is defined once, as oklch tokens, and the dark scheme is a
  redefinition of the same tokens. No inline colour literals in components;
  canvas code reads tokens with `getComputedStyle` and caches them.
- Anything that moves lives inside `@media (prefers-reduced-motion:
  no-preference)`. Nothing may depend on motion to be readable or operable.
- Comments explain WHY, especially where the obvious approach was rejected.
- Read `src/styles/global.css` in full before editing it. Run `npm run build`
  after each meaningful change, not once at the end.

## Pseudonymity

The site is pseudonymous: "VelaWind" only. Never a real name, never a CV link,
never anything that would let the handle be joined to a legal identity.

## Scenes and screenshots

Cards always run their live canvas scenes; real screenshots render only on
case-study pages, under `screenshot` in `src/lib/projects.ts`. The split is a
measurement, not a preference: the card panel is about 345 CSS px on the home
page's multi-column line, and a screenshot shrunk to that is unreadable specks.
Do not reintroduce screenshots to cards, and do not make the scene a fallback.

## Two traps that have already cost time here

- Python's `s.replace(old, new, 1)` fails SILENTLY when `old` does not match:
  the script reports success and the file is unchanged. For multi-line edits,
  use reviewed edits, or assert the string changed.
- `grep -E "error"` exits 0 when it FINDS errors, so
  `npm run build | grep error && git commit` commits a red build. Gate on the
  build's own exit code, never on grep output.
