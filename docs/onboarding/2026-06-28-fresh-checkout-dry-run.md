# Fresh-checkout dry run — 2026-06-28

A simulated first-time contributor set up the project from scratch to find friction in
onboarding. The goal: discover what to change/fix/document before inviting contributors.

## Method

A "fresh machine" was built as a privileged Docker container running Ubuntu 24.04 with its
own Docker daemon inside it (Docker-in-Docker, `vfs` storage driver so the inner daemon can
actually run containers nested under Docker Desktop). The two stated README prereqs — Bun and
Docker — were pre-installed; nothing else project-specific was. `node` was deliberately left
out (this is a Bun project).

A **blind agent** then played the new contributor: it could read only the freshly cloned
public repo's own docs (`README.md` → `CONTRIBUTING.md` → links), used no prior knowledge of
the project, ran every command inside the clean machine, and journaled each step. It cloned
`https://github.com/NathanAB/statuslin.es.git` and followed the documented happy path in order.

This is faithful for everything up to the GitHub OAuth step, which needs a human to create an
OAuth app and click through GitHub's consent screen — a wall a real newcomer also hits. The
agent stopped there, as designed.

## Bottom line

The happy path is genuinely smooth. A newcomer goes from `git clone` to a **running dev server
returning HTTP 200** and a **fully green quality gate (exit 0, 540 tests passing)** with **zero
blockers** and no local fiddling. The one real wall is creating a local user: the docs route it
through GitHub OAuth but never explain how to make the OAuth app.

> **Correction (verified after the run):** the blind agent claimed `bun run dev:login` would create
> a user and remove this wall. That is wrong — `dev:login` selects an *existing* user and errors
> (`No users in the DB — sign in once first.`) if there are none, and `seed:gallery` requires a user
> too. There is no script that creates the first user without OAuth (only `scripts/loadtest/seed.ts`
> inserts users, for load testing). So the GitHub OAuth app genuinely is the required first-user step.
> The fixes below document that path accurately rather than papering over it.

## What worked smoothly (don't touch)

- `git clone` → clean.
- `bun install` → 559 packages in ~5s.
- The Postgres `docker run` block → copy-paste, came up first try; ports/creds line up with the env defaults.
- `openssl rand -base64 32` for the secret → exactly as documented.
- `bun run db:migrate` → one command, clean success.
- `bun run dev` → up in ~900ms on the documented port 3100; homepage HTTP 200 with full content.
- `seed:gallery`'s error message → precise and actionable (`No user to author seeds — sign in once first.`).
- `bun run check` → fully green, didn't need the DB container running (PGlite), ~66s. Excellent.

## Friction log (ranked)

### MAJOR

**1. No instructions for creating the GitHub OAuth app.**
The only reference is an env comment: `# your dev GitHub OAuth app (callback http://localhost:3100/api/auth/callback/github)`.
CONTRIBUTING says you need "a free GitHub OAuth app" and links to the README, but neither tells
you *how*. This is the single hardest manual prerequisite and the least documented.
*Fix:* add a short "Create a GitHub OAuth app" subsection under README §2 with the exact field
values — Application name (anything), Homepage URL `http://localhost:3100`, Authorization
callback URL `http://localhost:3100/api/auth/callback/github` — and where to paste the resulting
Client ID + generated Client Secret.

**2. The `dev:login` escape hatch is invisible on the setup path.**
README §3 presents browser GitHub sign-in as the *only* way to create a local user
("Sign in once with GitHub to create your user, then (optionally) `bun run seed:gallery`").
But `bun run dev:login` (`scripts/dev-login.ts`, documented in `docs/testing-signed-in.md`) mints
a session and a user with **no OAuth app at all**. A newcomer who just wants a populated gallery
is forced down the OAuth road unnecessarily, and would only find `dev:login` by reading
`package.json` or `docs/`.
*Fix:* in README §3 add: "Don't want to set up GitHub OAuth yet? `bun run dev:login` mints a
local session and creates a user — then `bun run seed:gallery` works. See
`docs/testing-signed-in.md`." This lets a contributor reach a fully working, seeded local app
with **zero** GitHub setup.

### MINOR

**3. `.env.example` is all-blank while the README shows populated values.**
The prose says "Copy `.env.example` to `.env.local`", but the example file has every value empty.
The working `DATABASE_URL` and `BETTER_AUTH_URL` values live only in a *separate* README code
block, which also omits the `POSTHOG_*` / `E2B_API_KEY` keys the example file includes. The two
representations disagree, so a literal copy yields a non-working blank config the newcomer must
hand-merge.
*Fix:* ship `.env.example` with the safe local defaults pre-filled
(`DATABASE_URL=postgresql://postgres:postgres@localhost:5433/statuslines`,
`BETTER_AUTH_URL=http://localhost:3100`) and leave only the secrets blank; have the README say
"fill in `BETTER_AUTH_SECRET` and the GitHub creds." One source of truth.

**4. Port 3100 is asserted but not explained.**
It works, but a newcomer doesn't know the dev port is *derived from* `BETTER_AUTH_URL`, so they
don't know it would move if they changed that URL. One sentence fixes it.

### NIT

**5. Startup WARNING on every `bun run dev`:**
`WARNING: Invalid param name "slug.png" in route "/og/c/$slug.png"`. Harmless, but it's the first
thing a newcomer sees and reads like something is broken. Suppress/resolve it, or note it's expected.

**6. `bun run check` vs. the pre-push hook differ.**
Docs point newcomers at `bun run check`; the `pre-push` hook additionally runs `bun run smoke`. A
contributor whose `check` is green could be surprised by `smoke` at push time. Worth a one-line note.

## The OAuth wall (where the blind run stopped)

`bun run seed:gallery` → exit 1, `No user to author seeds — sign in once first.` Creating that
user needs GitHub sign-in, which needs a real OAuth app. Proof it's a hard wall:
`POST /api/auth/sign-in/social` redirects to
`https://github.com/login/oauth/authorize?...client_id=placeholder-github-client-id&...`; with a
placeholder client_id GitHub rejects it, and even with real creds the final step needs a human to
click through consent. The docs told the newcomer to "sign in once" and gave the callback URL, but
not how to create the OAuth app (#1) and not that `dev:login` exists (#2).

## Verbatim final gate output (tail)

```
$ bun run format && bun run check:ci
$ biome check --write .            Checked 239 files. No fixes applied.
$ tsc --noEmit
$ biome check .                    Checked 239 files. No fixes applied.
$ bun run scripts/check-frontend.ts   Front-end gate passed.
$ depcruise src ...                ✔ no dependency violations found (157 modules)
$ vitest run
 Test Files  90 passed | 2 skipped (92)
      Tests  540 passed | 7 skipped (547)
   Duration  65.72s
EXIT:0
```

## Resolution (fixes applied)

All six items were addressed on branch `docs/onboarding-smoothing` (gate green: 540 tests pass):

1. **GitHub OAuth app (Major)** — README §2 now has a "Create a GitHub OAuth app" subsection with
   the exact field values and where to paste the Client ID / secret.
2. **`dev:login` (Major, re-scoped)** — documented accurately in README §3: it re-auths an existing
   user in an automated browser; it does **not** create the first user and does **not** replace the
   GitHub sign-in. (Per maintainer decision, the OAuth-app path stays the required first-user step;
   no new code.)
3. **`.env.example` (Minor)** — now ships with the working local `DATABASE_URL` and `BETTER_AUTH_URL`
   pre-filled; README §2 shows only the values you must fill (secret + GitHub creds). One source.
4. **Port 3100 (Minor)** — README §2 now states the dev port is derived from `BETTER_AUTH_URL`.
5. **`slug.png` route warning (Nit)** — fixed for real: the route uses TanStack Router's
   `{$slug}.png` suffix syntax, so the param is a clean `slug`, the `/og/c/<slug>.png` URL is
   unchanged, and the startup warning is gone (verified: absent from dev startup; gate green).
6. **`check` vs `smoke` (Nit)** — README §4 notes that `git push` also runs `bun run smoke`.

## How to re-run

The fresh-machine image (`Dockerfile.freshmachine`) and the procedure are reproducible: build the
image, run it privileged, and dispatch a blind agent to onboard from the public clone. Re-running
after applying the fixes above is the way to confirm a newcomer can now reach a seeded, working
local app without leaving the terminal.
