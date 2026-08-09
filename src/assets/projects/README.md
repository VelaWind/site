# Case-study screenshots

Screenshots go here, one per project, named for the project: `lodestar.png`,
`vela-sea.png`. They render in the slot on the project's case-study page — the
cards always run their live canvas scenes instead, because a screenshot shrunk
to card size is unreadable specks.

The capture spec — dimensions, what belongs in frame, and what to do about
cursors, scrollbars and personal data — is in the site README under
"Case-study screenshots". Read it before capturing; a screenshot that has to
be retaken is a screenshot that was captured to the wrong size.

Dropping a file in here does nothing on its own. The page only shows it once
`src/lib/projects.ts` names it under `screenshot`, together with the alt text.
A screenshot on a project with no case study fails the build: it would render
nowhere.
