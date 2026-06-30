# Deploy runbook — staging → production

How statuslin.es ships. Same code, three environments; the only thing that differs is
where the values live. Decided 2026-06-13.

## The model

The app reads `process.env` at runtime (via `requireEnv`, `src/lib/env.ts`). How that gets
filled differs per environment:

| | Local | Staging | Production |
|---|---|---|---|
| Runs on | your machine | Fly app `statuslines-staging` | Fly app `statuslines` |
| Database | Neon `dev` branch | Neon `staging` branch | Neon `production` branch |
| GitHub OAuth app | your existing dev app | staging OAuth app | production OAuth app |
| Domain | `localhost` | `staging.statuslin.es` | `statuslin.es` |
| `BETTER_AUTH_URL` | `http://localhost:3100` | `https://staging.statuslin.es` | `https://statuslin.es` |
| Secrets live in | `.env.local` (gitignored) | Fly secret store | Fly secret store |
| E2B | shared key + template | shared key + template | shared key + template |

**Staging and production run the same Docker image.** You validate an image on staging, then
deploy that exact image (by digest) to production — never a separate rebuild.

## What runs in each Fly app

Two process groups off one image (declared in `fly.toml` for prod and `fly.staging.toml` for staging):
- **web** — `bun run .output/server/index.mjs` — public, serves site + auth + API.
- **worker** — `bun run scripts/worker.ts` — always-on poller; renders submitted scripts via E2B. No public port.

## The six environment variables

From `.env.example` (the committed contract):

| var | differs per env? | notes |
|---|---|---|
| `DATABASE_URL` | yes | the env's Neon branch; use the **pooled** connection string |
| `BETTER_AUTH_SECRET` | yes | a distinct random secret per env (`openssl rand -base64 32`) |
| `BETTER_AUTH_URL` | yes | the env's public origin; everything else (dev port, auth origins) derives from this |
| `GITHUB_CLIENT_ID` | yes | the env's OAuth app |
| `GITHUB_CLIENT_SECRET` | yes | the env's OAuth app |
| `E2B_API_KEY` | no | one E2B account serves all envs |

No R2 keys — preview data is stored in Postgres (`previews` table), and OG card images are rendered on
the fly by the app (`src/og`), not stored. R2 isn't used.

## One-time setup (per environment)

### Neon
Branch the existing project: `dev` (your current DB), `staging`, `production`. Grab each
branch's **pooled** connection string for that env's `DATABASE_URL`.

### GitHub OAuth apps
A GitHub OAuth app holds exactly one callback URL, so each host needs its own app: the **dev**
app already exists (callback `http://localhost:3100/...`), and you create **staging** + **prod**.
For each new one:
- Homepage: the env's origin.
- Authorization callback URL: `<origin>/api/auth/callback/github`
  (e.g. `https://staging.statuslin.es/api/auth/callback/github`).
- Copy its client ID + secret into that env's secrets.

### E2B (once, account-wide)
1. Sign up at e2b.dev, put the API key in your local `.env.local`.
2. Build the custom sandbox template: `bun run build:e2b-template` (bakes in jq/bc/gawk/column/strace).
   Serves every environment since they share the E2B account.

### Fly apps
```sh
fly apps create statuslines-staging
fly apps create statuslines      # production
```
Set each app's secrets (per-env values from above). Bulk-import from a gitignored local file:
```sh
fly secrets import --app statuslines-staging < .env.staging
fly secrets import --app statuslines      < .env.production
```
`.env.staging` / `.env.production` are gitignored (the `.env.*` rule); they're the *source you
push from*, never read by the servers.

## Per-environment machine size

Staging and prod use **separate Fly config files** so each sizes its machines independently:

- **`fly.toml`** — production (`app = "statuslines"`): web `shared-cpu-2x` / 1GB, worker
  `shared-cpu-1x` / 512MB (separate `[[vm]]` blocks — only web needs to absorb a launch spike),
  `min_machines_running = 1`. Add web headroom with `fly scale count web=N`.
- **`fly.staging.toml`** — staging (`app = "statuslines-staging"`): `shared-cpu-1x` / 512MB,
  `min_machines_running = 0` — the web process scales to zero when idle. (The worker is a separate
  background machine, not behind the proxy, so it keeps running; `fly scale count worker=0` stops it.)

Fly can't include one file from another, so `[build]`, `[processes]`, `[http_service]` port, and
`[deploy]` are duplicated in both — a header comment in each lists what must stay in sync. Only the
`[[vm]]` size/memory and `min_machines_running` differ on purpose.

**Why two files instead of `fly scale vm`:** a `fly scale vm` / `fly scale memory` change is **reset
on the next deploy** whenever a `[[vm]]` block is in the config. Prod ships by promoting the staging
image, so that promote would shrink prod back every time — the size has to live in the config file.
The sizing rationale: memory clears a measured OOM cliff; the lower `soft_limit` makes Fly add a
machine before the box is in trouble.

## Deploying

Staging:
```sh
fly deploy --config fly.staging.toml
```
The `release_command` in the Fly config runs `bun run src/db/migrate.ts` against that env's DB before
the new version goes live. That script applies migrations via `drizzle-orm`'s runtime migrator
(`drizzle-orm/postgres-js/migrator`) reading the committed `drizzle/` SQL folder — it does **not**
use the `drizzle-kit` CLI. So the only things the image must keep are `drizzle-orm` (a runtime
dependency, never pruned) and the `drizzle/` folder (copied in) — verify the `drizzle/` copy
survives when editing the generated Dockerfile.

Promote to production with the **gated** command — never promote by hand:
```sh
bun run deploy:prod
```
`scripts/deploy-prod.ts` does three things and **refuses to promote unless the middle one passes**:
1. `fly deploy --config fly.staging.toml`
2. a **real-browser smoke against staging** — `SMOKE_BASE_URL=https://staging.statuslin.es
   SMOKE_SIGNED_OUT_ONLY=1 bun run smoke` — which loads the home + a `/c/<slug>` detail page in
   `agent-browser` and fails if either doesn't hydrate or logs a console error.
3. only on green, `fly deploy --app statuslines --image registry.fly.io/statuslines-staging@<digest>`
   (the exact image it just validated, by digest — no rebuild).

**Why this is mandatory, not optional:** every source gate (tsc/lint/vitest) passes while the client
bundle is dead — a server-only import leaking into the browser throws `Buffer is not defined`,
hydration fails, every button goes dead, and SSR still returns 200 so nothing alerts. That shipped
to prod for ~2.5h on 2026-06-29. Staging runs the **exact same image** we promote, so smoking staging
smokes the real production bundle. The smoke uses the signed-out checks only (the signed-in half mints
a session against the local dev DB, which staging doesn't share). **Do not** run the two `fly deploy`
commands by hand and skip the smoke — that's the hole that let the crash ship.

## DNS (Cloudflare, after the first Fly deploy)

For each subdomain, point Cloudflare at the Fly app. First deploy **DNS-only** (gray cloud) so
Fly can issue its TLS cert; once green, switch to **proxied** (orange) for CDN + WAF.
- `staging` → `statuslines-staging`
- `@` (apex) + `www` → `statuslines`

## Local `.env.local`

Bun auto-loads `.env.local` for local dev (and it overrides a bare `.env`). Point `DATABASE_URL` at a
**local Postgres** — there's no hosted dev DB — e.g. a Docker `postgres` container; then
`bun run db:migrate` to create the schema and `bun run seed:gallery` for sample data. Auth runs at
`BETTER_AUTH_URL=http://localhost:3100`. `.env.staging` / `.env.production` are *not* auto-loaded —
they're only the source you push to Fly secrets. Unit/integration tests don't need any of this — they
run on PGlite against the committed migrations.

## Order of operations (first launch)

1. Sign up: Fly, E2B. (Neon already exists.)
2. Neon `staging` branch; build the E2B template; create the staging GitHub OAuth app.
3. `fly launch --no-deploy` — generates the `Dockerfile` + `fly.toml` and creates the staging app.
   Then edit `fly.toml` for the two process groups + `release_command`, and the `Dockerfile` for
   the migration caveat above. Add `.dockerignore`.
4. Set staging secrets (`fly secrets import --app statuslines-staging < .env.staging`).
5. `fly deploy --config fly.staging.toml`; verify on the `*.fly.dev` URL, then point `staging`
   DNS in Cloudflare and verify on `staging.statuslin.es`.
6. Shake out kinks on staging.
7. Create the prod app + OAuth app; set production secrets; promote the validated image; point
   apex DNS; verify the full signed-in round trip on `statuslin.es`.

## Render-queue alerts (PostHog)

The render worker emits two PostHog events the maintainer can alert on. Both are **fail-soft and
prod-only**: `captureServerEvent` is a no-op when the worker has no `POSTHOG_PROJECT_TOKEN`, so local
and staging never emit them — the alerts only have data to act on once the worker runs in production.

- **`render_worker_heartbeat`** — emitted every 5 minutes by `scripts/worker.ts`, DB-free (a liveness
  ping; no DB poll, so it doesn't keep Neon's compute warm). `distinctId: 'render-worker'`.
- **`render_queue_drained`** — emitted at the end of every drain by the worker, with
  `{ processed, queuedRemaining, oldestQueuedAgeSec }`.

### PostHog alert facts (verified against the docs, 2026-06-25)

- Alerts attach only to **trends** insights (not funnels/retention).
- Check interval options: **every 15 min** (requires a paid Boost/Scale/Enterprise plan), **hourly**,
  daily, weekly, monthly. On the free plan the floor is **hourly**.
- Insight-based alerts are **delayed up to ~1 hour** regardless of the check interval (PostHog's own
  caveat) — so treat detection latency as roughly an hour, not the window size. For a faster signal
  you'd need a different mechanism (e.g. an external uptime check), out of scope here.
- Notify via email, Slack, Discord, or webhook. These email the maintainer.

### The two alerts (create these AFTER the first prod worker deploy)

Do NOT create them before the worker is live and emitting. The "worker down" alert fires when the
heartbeat count is below 1; created against a project with no `render_worker_heartbeat` events yet, it
would fire immediately and email you on a false alarm. Create both once the events appear in PostHog.

1. **Worker down / crashed** — trends insight counting `render_worker_heartbeat` over the **last 15
   minutes**; alert when the count is **< 1** → email. (At a 5-min heartbeat, two pings must be missed
   before it fires.)
2. **Queue stuck** — trends insight on `render_queue_drained`, value = **max(`oldestQueuedAgeSec`)**
   over the **last 30 minutes**; alert when **> 900** (15 min of the oldest queued job sitting
   unrendered) → email.

Both can be created in the PostHog UI (insight → Alerts → New alert) or via the PostHog MCP
(`render_worker_heartbeat` / `render_queue_drained` are the event names). Re-create them from this
section if the project is ever rebuilt.

## Not yet (later)

- GitHub Action: auto-deploy staging on merge to main, manual approval to promote to prod.
