---
name: verify
description: Drive statuslin.es (the status line + mod gallery web app) in a real browser on an isolated local instance and capture proof. Use to verify a UI, auth, submit, review, gallery, copy/install or mod change works end to end, the way a visitor, author or admin would, before calling it done.
---

# Verify statuslin.es

statuslin.es is a TanStack Start web app. Users touch it in a browser: visitors browse and copy,
signed-in authors submit, admins review on `/admin`. This skill runs a **separate** instance of
the app (own port, own Postgres database, own browser sessions), drives it with `agent-browser`,
and leaves proof in `.verify/evidence/`.

Everything goes through one helper. Call it by its literal path from the repo (or worktree) root:

```bash
.claude/skills/verify/scripts/verify-instance.sh
```

Run it with no arguments for usage. The instance serves `http://localhost:3110`. Its database is
`statuslines_verify_3110_<checkout>` and its browser sessions `statuslines-verify-3110-<checkout>-<role>`,
where `<checkout>` is a hash of this checkout's path (`doctor` prints both). So a run from another
worktree can never drive or drop this one. Set `VERIFY_PORT=3111` (etc.) on every call to run a
second instance from the same checkout; the feature files say `3110`, so swap the port in their URLs.

Read [`features/README.md`](features/README.md) before driving, then the feature file you're proving.

## Launch

Prereqs: `bun install` done, `.env.local` present (copy it from the main checkout in a worktree),
and the `statuslines-postgres` Docker container running (`docker start statuslines-postgres`).

```bash
.claude/skills/verify/scripts/verify-instance.sh up
```

`up` recreates the verify DB, applies the committed migrations, inserts two disposable users
(`verify-admin@test.invalid`, role admin; `verify-author@test.invalid`, role user), then starts
`bun run dev --strictPort` with `BETTER_AUTH_URL=http://localhost:3110`, `RENDER_RUNNER=fake`, and
`RESEND_API_KEY` and `POSTHOG_PROJECT_TOKEN` set empty, so no email or analytics leaves even if
`.env.local` has keys. Ready means it prints `verify: up at http://localhost:3110` (it polls
`GET /api/health` and checks the listener is its own; startup takes about 6 s). Server output goes
to `.verify/run/3110/server.log`.

It refuses the dev server's port (the one in `.env.local`'s `BETTER_AUTH_URL`, normally 3100) and
any port held by a process it didn't start. Don't pick 3101 either: the `candidates` dev config
uses it. Running `up` again on a healthy instance changes nothing; on one that is still starting or
unhealthy it stops and tells you to run `down`.

The database starts empty: no published status lines, no mods. Each feature file says what state
it needs and how to create it through the app.

The server hot-reloads code from the working tree, so code edits apply without a restart. A new
migration does not: run `down`, then `up` (`doctor`'s migration count catches a stale schema).

## Doctor

Run this first whenever anything looks off (a 500, a signed-out page that should be signed in,
data you didn't create):

```bash
.claude/skills/verify/scripts/verify-instance.sh doctor
```

It is read-only and checks: the server process is alive and is the one this checkout started,
port 3110 is held by that process group, `/api/health` answers ok, the Postgres container is up,
all `drizzle/*.sql` migrations are applied to the verify DB, both disposable users exist, and the
server's env points `DATABASE_URL` at the verify DB with `RENDER_RUNNER=fake` and empty email and
analytics keys. Any `FAIL` means: run `down`, then `up`. Never drive an instance whose doctor fails.

## Drive

Browser: `agent-browser`, one session per role.

```bash
.claude/skills/verify/scripts/verify-instance.sh login author     # or: login admin
.claude/skills/verify/scripts/verify-instance.sh ab author open http://localhost:3110/submit
.claude/skills/verify/scripts/verify-instance.sh ab author wait --load networkidle
.claude/skills/verify/scripts/verify-instance.sh ab author snapshot -i
.claude/skills/verify/scripts/verify-instance.sh ab author find label "Title" fill "My status line"
.claude/skills/verify/scripts/verify-instance.sh ab author find role button click --name Submit --exact
.claude/skills/verify/scripts/verify-instance.sh ab author wait --text "Queued for review"
```

- Roles: `anon` (signed out, never logged in), `author`, `admin`. `login` mints a session with
  `bun run dev:login` against the verify DB and sets the httpOnly cookie in that role's session.
  GitHub sign-in itself can't be driven; this is the only way in.
- `ab <role> <args>` passes everything after the role to `agent-browser --session …`. Prefer
  `find role <role> --name <name>` and `find label <label>` over refs: refs (`@e12`) change with
  every snapshot.
- Read the page with `snapshot -i` (interactive elements) or `get text main` (visible copy, such as
  status badges, which interactive snapshots omit).
- A `click` returns before the server answers. After any click that saves something, wait for its
  result with `ab <role> wait --text "<expected text>"` before the after-snapshot or `get text`.
- Copy buttons: headless Chrome denies clipboard reads. Run `copy-spy <role>` after the page loads
  (again after every navigation), click the copy button, then `copied <role>` prints the exact text
  the page wrote.
- Side effects: `sql "<query>"` runs SQL against the verify DB, for example
  `sql "select slug, status from configs"`. `db-url` prints the verify DB's `DATABASE_URL` for repo
  scripts that need one.
- Render jobs run in the dev server's background drain right after submit. With the fake runner
  they finish within a second or two and every scenario renders an empty line.

In a worktree-isolated Claude Code session, the command checker refuses what it can't read as
non-git. Keep each call plain: the literal helper path as the command, one helper call per line,
no shell variables as commands, no `for` loops around helper calls, no `$'…'` strings. It also
refuses an `eval` argument (use `copy-spy`/`copied`, not `ab <role> eval`) and the bare word `Bash`
as an argument (select the element another way, such as by `href`).

## Evidence

```bash
.claude/skills/verify/scripts/verify-instance.sh evidence submit-status-line
```

The argument is the **feature ID**: the feature file's name without `.md`. It prints a fresh
`.verify/evidence/<feature-id>/<UTC timestamp>/` directory. Put every artifact for that proof in it,
numbered in the order taken:

- `ab <role> snapshot > <dir>/NN-step.aria.txt` and `ab <role> screenshot <dir>/NN-step.png`
  (add `--full` for the whole page). The helper makes a relative image path absolute; `agent-browser`
  on its own would resolve it against its daemon's directory.
- `sql "…" > <dir>/NN-db.txt` for each side-effect read-back.
- `errors <role> > <dir>/NN-errors.txt` for each page proved.
- `<dir>/NOTES.md`: the feature ID, then one line per sub-feature ID from the feature file:
  `proved` with the entry point used and the artifact numbers, or `skipped` with the command tried
  and the unmet precondition.

`.verify/` is gitignored. Report back with the evidence directory path and the NOTES.md lines.

What counts as proof:

- Drive the real user path: the form, the button, the page. Never call server functions, insert
  rows the feature is supposed to create, or hit test-only endpoints in place of the UI. Inserting
  the two users at `up` and minting sessions with `login` are the only shortcuts; they stand in for
  GitHub OAuth, which no local run can drive.
- Capture the action and the state it produced: a snapshot or screenshot before the click and after
  it, not only the final screen.
- Check side effects next to what's visible: the `configs`, `submissions`, `render_jobs`,
  `copy_events` or `mods` rows the action should have written, read back with `sql`.
- Check for errors on each page you prove. `errors <role>` prints uncaught page errors and console
  errors (including React hydration warnings) since its last call, then clears them, so run it once
  right before opening the page and once after the last action on it; the second run must print
  `no page or console errors`. For server-side failures (SSR, server functions, the render drain),
  read `.verify/run/3110/server.log` for stack traces.
- Fakes only where production already has a boundary: `RENDER_RUNNER=fake` stands in for the E2B
  sandbox for status lines, and the empty `RESEND_API_KEY` means no email leaves (approval and
  rejection emails record as `ambiguous`). Mods have no fake: submit, render and approve call
  GitHub and E2B for real, so get the user's OK first (see [mods](features/mods.md)).
  When the rendered preview itself is the thing under test, the fake runner
  can't prove it; say so instead of claiming it.
- An entry point you couldn't reach is reported as skipped with the unmet precondition, never as
  verified through another path.

If no feature file covers what you changed, drive it the same way, then add a feature file for it
(or correct the one that was wrong) following the contract in `features/README.md`. For a full pass
over the map, use `/maintain-verification-skill`.

## Cleanup

```bash
.claude/skills/verify/scripts/verify-instance.sh down
```

`down` closes this checkout's three browser sessions, kills the dev server's process group only if
the recorded PID is still the process it started (a PID file left by a crash or reboot is reported
and nothing is killed), drops this checkout's verify DB, and removes `.verify/run/3110/`. It leaves
`.verify/evidence/` alone; that's where the proof stays. Run `down` after every run, including failed
ones. If Docker is down it says the DB wasn't dropped; run `down` again once it's up.

## Helpers

`scripts/verify-instance.sh` is the only helper. Subcommands: `up`, `doctor`,
`login <admin|author>`, `ab <anon|admin|author> <agent-browser args>`, `errors <role>`,
`copy-spy <role>`, `copied <role>`, `sql "<query>"`, `db-url`, `evidence <feature-id>`, `down`.
Repo scripts it builds on: `scripts/dev-login.ts` (session cookie), `bun run db:migrate`,
`bun run dev`. For a broad hydration check instead of one feature, the repo also has
`bun run smoke`, but it targets the main dev server and dev DB, not this instance.
