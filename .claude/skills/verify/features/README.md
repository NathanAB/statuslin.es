# statuslin.es verification map

The maintained source for verifying statuslin.es's user-facing behavior. Read this index before
driving the app, then use the matching feature file as the recipe. `H` below means the helper,
`.claude/skills/verify/scripts/verify-instance.sh`, always called by that literal path. URLs use
port 3110; with another `VERIFY_PORT`, swap the port.

## Baseline preconditions

- `H up` printed `verify: up at http://localhost:3110`, and `H doctor` prints `verify doctor: healthy`.
- The verify DB is fresh from `up`: two users (`verify-admin@test.invalid` admin,
  `verify-author@test.invalid` user), no status lines, no mods.
- `RENDER_RUNNER=fake`: renders finish in a second or two and every preview scenario is empty.
- The helper starts the server with empty `RESEND_API_KEY` and `POSTHOG_PROJECT_TOKEN`: no email
  leaves the machine and no analytics are sent.
- Never drive the user's dev server, anything on port 3101, or an instance `doctor` doesn't call ours.

## Driving conventions

- One `agent-browser` session per role: `H ab anon …`, `H ab author …`, `H ab admin …`. Sign a
  role in with `H login author` or `H login admin`; `anon` stays signed out.
- After `open`, run `H ab <role> wait --load networkidle` before reading or clicking.
- After a click that saves something, `H ab <role> wait --text "<result text>"` before reading the result.
- Locate by role and accessible name (`find role button click --name Approve --exact`) or label
  (`find label "Title" fill …`). Don't use `@eN` refs across snapshots.
- `snapshot -i` lists controls; `get text main` shows visible copy (badges, decided states).
- A feature that needs a published status line creates it through the app: submit as author
  ([submit-status-line](./submit-status-line.md)), approve as admin ([review-queue](./review-queue.md)).
- Read side effects with `H sql "<query>"`.

## Proof and skip reporting

- `H evidence <feature-id>` makes the artifact directory; the feature ID is the feature file's name.
- UI proof: a snapshot (saved as `.aria.txt`) and a screenshot before and after the action.
- Mutation proof: the `sql` read-back of the rows the action wrote, saved next to the screenshots.
- Client health: `H errors <role>` run before opening each proved page and again after it; the
  second run prints `no page or console errors`. Server errors show in `.verify/run/3110/server.log`.
- Copy proof: the exact copied text from `H copied <role>`, plus the `copy_count` change.
- `NOTES.md` in the evidence directory lists each sub-feature ID as `proved` (entry point, artifact
  numbers) or `skipped` (command tried, unmet precondition).
- Don't report a skipped entry point as verified through another path.

## Feature entry contract

Each feature file starts with an H1 title and one paragraph describing the user-visible behavior.
It then uses exactly four H2 sections in this order.

1. `Sub-features` lists short IDs with one line for each behavior.
2. `How to get to it (user POV)` lists every user entry point.
3. `Driving it with agent-browser` starts with `Preconditions:` and uses labeled bullets that pair
   each user action with an exact command and observable result.
4. `Gotchas` lists traps that can waste or invalidate a verification run.

Keep implementation details out of the map. Name only user paths, stable handles, required state,
commands, and observable proof.

## Features

- [Submit a status line](./submit-status-line.md): the signed-in submit form, the queued toast,
  and the submission on `/me`.
- [Review queue](./review-queue.md): an admin approves or rejects a submission on `/admin`.
- [Browse the gallery](./gallery.md): home list, Show filter, sort menu, and facet pages.
- [Copy a status line to use](./copy-status-line.md): the detail page's install prompt and script
  copy, and the copy count.
- [Mods](./mods.md): submit a mod by GitHub link, `/me`, review and approve on `/admin`, the mod
  page and its install prompt, and `/marketplace.json`. Submit, render and approve need GitHub and
  E2B access; see its preconditions.
- [Status line setup guide](./status-line-guide.md): `/guide`'s sample stdin JSON, its `Copy JSON`
  button, the field list and the minimal script.
- [Claude Code buddy guide](./buddy-guide.md): `/guide/claude-code-buddy`, its published pet mod cards,
  the shared-command note, card links to each mod page, and its sitemap, llms.txt and footer links.
