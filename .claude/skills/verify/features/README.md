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

## Fresh and populated instances

- A fresh DB can't reach some states through the app: gallery paging needs more than ten published
  items, and mods need GitHub and E2B to submit. Features that need those say so. Drive them on a
  populated instance, one whose verify DB already holds published rows copied from another local
  DB (the [buddy guide](./buddy-guide.md) has the `pg_dump` recipe for mods), or report them skipped.
- When the instance on 3110 is populated and shared, run the flows that write rows (submit, review,
  copy counts, sign-out) on a second, fresh one: `VERIFY_PORT=3111 H up`, then the same port on
  every call, and `VERIFY_PORT=3111 H down` when done. On the shared one, remove the residue of
  any write you made (a copy event row and its count) and leave its roles signed in.

## Driving conventions

- One `agent-browser` session per role: `H ab anon …`, `H ab author …`, `H ab admin …`. Sign a
  role in with `H login author` or `H login admin`; `anon` stays signed out.
- After `open`, run `H ab <role> wait --load networkidle` before reading or clicking.
- After a click that saves something, `H ab <role> wait --text "<result text>"` before reading the result.
- Locate by role and accessible name (`find role button click --name Approve --exact`) or label
  (`find label "Title" fill …`). Don't use `@eN` refs across snapshots.
- `snapshot -i` lists controls; `get text main` shows visible copy (badges, decided states).
- Many names repeat across the header, the phone menu, the page and the footer (`Submit`,
  `Resources`, `GitHub`, `How it works`, `Are mods safe?`, `Clear search`), and `--name` matches part
  of a name. Pass `--exact`, and scope with `header …`, `footer …` or `main …` selectors.
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

- [Site navigation](./site-navigation.md): the header, the `@handle` user menu, sign-out, the phone
  menu, and the footer's link columns.
- [Home hero](./home-hero.md): pick a status line or mod and see it in a Claude Code session, in
  the terminal or Claude Desktop, and copy its install prompt from there.
- [Browse the gallery](./gallery.md): the home list's sort, search and pages, the URL filters,
  topic pages, `/status-lines/best` and `/mods`.
- [How listings are checked](./how-it-works.md): the home band of four checks and `/how-it-works`
  with its live examples.
- [Submit a status line](./submit-status-line.md): the signed-in submit form, the queued toast,
  and the submission on `/me`.
- [Review queue](./review-queue.md): an admin approves or rejects a submission on `/admin`.
- [Copy a status line to use](./copy-status-line.md): the detail page's `Before you install`
  facts, install prompt and script copy, the long-script fold, and the install count.
- [Mods](./mods.md): submit a mod by GitHub link, `/me`, review and approve on `/admin`, the mod
  page with `What this mod can do` and its install prompt, `/mods`' marketplace line, and
  `/marketplace.json`. Submit, render and approve need GitHub and E2B access; see its preconditions.
- [Status line setup guide](./status-line-guide.md): `/guide`'s numbered steps and their copy
  buttons, the sample stdin JSON with `Copy JSON`, the field list, and `On this page`.
- [Status line not showing guide](./status-line-not-showing.md): `/guide/status-line-not-showing`'s
  `Copy fix prompt` and its fixes.
- [Resources](./resources.md): `/resources`' tool cards, the matching status lines and alternatives
  links, the customize panels, and its marketplace command copy.
- [Claude Code buddy guide](./buddy-guide.md): `/guide/claude-code-buddy`, its published pet mod cards,
  the shared-command note, card links to each mod page, and its sitemap, llms.txt and footer links.
