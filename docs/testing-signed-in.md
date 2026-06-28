# Testing signed-in UX

Auth is GitHub-only, so an automated browser can't reach the signed-in pages (vote, submit, admin) by clicking "Sign in" — GitHub OAuth can't be driven headlessly. Instead, mint a session directly and set its cookie. This is **dev-only** (it bypasses login by signing a cookie with `BETTER_AUTH_SECRET`); never expose it anywhere real.

## TL;DR

```bash
# 1. dev server running (bun run dev) and DB migrated (bun run db:migrate)
# 2. mint a session + print the cookie command:
bun run dev:login            # first admin, else first user
bun run dev:login "Ada"      # by name
bun run dev:login me@x.com   # by email
# 3. copy the printed `agent-browser cookies set ...` line and run it
# 4. drive the browser — now signed in:
agent-browser open http://localhost:3100/c/<slug>
agent-browser snapshot          # the upvote shows as a Button, not a Sign-in link
```

`bun run dev:login` (`scripts/dev-login.ts`) inserts a row in the Better Auth `session` table for the chosen user and prints the **signed** `better-auth.session_token` cookie plus a ready `agent-browser cookies set …` command.

## Why a plain token doesn't work

Better Auth **signs** the session cookie. The value is not the raw token — it's:

```
better-auth.session_token = `${token}.${base64(HMAC_SHA256(BETTER_AUTH_SECRET, token))}`
```

Standard base64 (`+/=`), **not** base64url. This matches better-call's `signCookieValue`
(`node_modules/better-call/dist/crypto.mjs`). If Better Auth changes its scheme, update
`scripts/dev-login.ts` to match that file.

The cookie is **httpOnly**, so JavaScript (`document.cookie`) can't set it — use
`agent-browser cookies set … --httpOnly` (CDP), which the helper's printed command does.

## Gotcha that bit us (2026-06-06)

The signed-in detail page 500'd with `Failed query: select … from "votes"`. The `votes`
migration was committed but never applied to the **dev** DB — the test suite uses PGlite (which
auto-runs migrations), so the gate stayed green and hid it. Signed-out browsing didn't touch the
table, so it only showed up signed in.

**Always `bun run db:migrate` against the dev DB after adding a migration.** Signed-in testing is
how you catch the gap, because a signed-in page often reads tables a signed-out one doesn't.

## Full vote example (verified end-to-end)

```bash
bun run db:migrate
COOKIE=$(bun run dev:login | sed -n 's/better-auth.session_token=//p')
agent-browser cookies set better-auth.session_token "$COOKIE" --url http://localhost:3100 --httpOnly
agent-browser open http://localhost:3100/c/<slug>
agent-browser snapshot                      # find the "Upvote" button's @ref
agent-browser click @<ref>                   # → "Remove upvote", count +1
agent-browser click @<ref>                   # → "Upvote", count back down
```

The count is recomputed from the actual `votes` rows on every toggle, so a seeded/denormalized
count will self-correct to the real number on the first real vote.

## Cleanup

`dev:login` leaves a session row per run (harmless, expires in 30 days). To clear them:

```bash
docker exec statuslines-pg psql -U postgres -d postgres -c "DELETE FROM session WHERE user_agent IS NULL;"
```

(`dev:login` sessions have a null `user_agent`; real logins set one.)
