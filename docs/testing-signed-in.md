# Testing signed-in UX

Auth is GitHub-only, so an automated browser can't reach the signed-in submission and admin pages by clicking "Sign in" — GitHub OAuth can't be driven headlessly. Instead, mint a session directly and set its cookie. This is **dev-only** (it bypasses login by signing a cookie with `BETTER_AUTH_SECRET`); never expose it anywhere real.

## TL;DR

```bash
# 1. dev server running (bun run dev) and DB migrated (bun run db:migrate)
# 2. mint a session + print the cookie command:
bun run dev:login            # first admin, else first user
bun run dev:login "Ada"      # by name
bun run dev:login me@x.com   # by email
# 3. copy the printed `agent-browser cookies set ...` line and run it
# 4. drive the browser — now signed in:
agent-browser open http://localhost:3100/submit
agent-browser snapshot          # the submission form is available
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

## Submission example

```bash
bun run db:migrate
COOKIE=$(bun run dev:login | sed -n 's/better-auth.session_token=//p')
agent-browser cookies set better-auth.session_token "$COOKIE" --url http://localhost:3100 --httpOnly
agent-browser open http://localhost:3100/submit
agent-browser snapshot
```

Always run `bun run db:migrate` against the dev database after adding a migration. PGlite-backed
tests apply committed migrations independently, so signed-in browser testing catches a stale dev
database before it hides a submission or admin issue.

## Cleanup

`dev:login` leaves a session row per run (harmless, expires in 30 days). To clear them:

```bash
docker exec statuslines-postgres psql -U postgres -d statuslines -c "DELETE FROM session WHERE user_agent IS NULL;"
```

(`dev:login` sessions have a null `user_agent`; real logins set one.)
