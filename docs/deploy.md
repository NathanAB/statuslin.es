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

## Fingerprinted asset retention

Each candidate image is self-contained with the current plus nineteen prior distinct
`/assets/**` generations. The Docker build mounts the previous production image's `.output`
read-only, builds the current generation, then `scripts/retain-build-assets.ts` copies the selected
historical files and writes `.output/public/assets/.asset-generations.json`. Identical generations
and identical files are stored once; malformed manifests, missing files, unsafe paths, symlinks,
and same-name files with different contents fail the build.

Nitro's generated static manifest knows only about the current build. Current assets are served by
Nitro's normal static middleware; on a miss, the explicit method-agnostic `/assets/**` handler runs
before the catch-all renderer and serves retained `GET`/`HEAD` files with immutable caching. Other
methods return 405. Do not add a non-fallthrough `publicAssets` base for this directory: it would
intercept retained paths before the fallback can inspect them safely.

`PREVIOUS_IMAGE` defaults to the Dockerfile's empty `asset-retention-bootstrap` stage so the first
build has a valid `/app/.output/public/assets` mount. Normal staging deploys must override it with
the exact currently running production image; production still promotes the tested staging digest
without rebuilding.

## What runs in each Fly app

One process group, **web** (`bun run .output/server/index.mjs`, declared in `fly.toml` for prod and
`fly.staging.toml` for staging): public, serves site + auth + API. It also renders submitted status
lines through E2B, in the background ([ADR 0006](./adr/0006-renders-run-on-demand.md)):

- A submission, the admin's re-queue and "Run network preview" each start a drain in that machine
  (`src/server/render-drain.ts`).
- Each machine drains once at startup (`src/server/render-drain-plugin.ts`), which picks up jobs
  queued while no machine was running.
- Several machines can render at once; each job is claimed with a conditional update.
- A machine that Fly stops (a deploy, or auto-stop) gets SIGINT and puts the job it is rendering
  back: `queued`, or `held` for a network job. The next machine to drain renders it.
- A job left `running` for over 15 minutes (`STALE_RUNNING_JOB_MS`) was cut off by a crash. The next
  drain puts it back the same way, and the admin's re-queue accepts it too. Nothing notices it before
  then: drains only run on the triggers above.
- A job cut off on its third attempt (`MAX_RENDER_ATTEMPTS`), or after its submission was decided,
  fails instead.

There is no worker process. Mod previews render from the operator's machine (`render:mods`).

## The environment variables

From `.env.example` (the committed contract):

| var | differs per env? | notes |
|---|---|---|
| `DATABASE_URL` | yes | the env's Neon branch; use the **pooled** connection string, and add **`sslmode=require`** (or verify-ca / verify-full) so the connection is encrypted — staging and prod refuse to boot without it (`src/db/assert-tls.ts`) |
| `BETTER_AUTH_SECRET` | yes | a distinct random secret per env (`openssl rand -base64 32`) |
| `BETTER_AUTH_URL` | yes | the env's public origin; everything else (dev port, auth origins) derives from this |
| `GITHUB_CLIENT_ID` | yes | the env's OAuth app |
| `GITHUB_CLIENT_SECRET` | yes | the env's OAuth app |
| `E2B_API_KEY` | no | one E2B account serves all envs |
| `RENDER_RUNNER` | — | **local only**: `fake` renders submissions without E2B. Leave unset on staging and production, which refuse it (`NODE_ENV=production`) |
| `RESEND_API_KEY` | yes | server-only key used to email submission review decisions |
| `GITHUB_TOKEN` | no | **optional**, not set on Fly: only the operator mod scripts read it (`import:mods`, `render:mods`, `publish-mod`, `check-mods`, …), from `.env.local` or the shell. It raises GitHub's API limit from 60 to 5,000 requests an hour, so a long curation run doesn't stall. A fine-grained token with public-repository read access (the default, no extra permissions) is enough |

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

### Resend (once, account-wide)
1. Add and verify the `statuslin.es` sending domain in Resend, including its DNS records.
2. Create separate API keys for staging and production, then set each environment's
   `RESEND_API_KEY`.
3. Approval and rejection emails are sent from `statuslin.es reviews <reviews@statuslin.es>` with replies going to
   `hello@statuslin.es`.

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

- **`fly.toml`** — production (`app = "statuslines"`): web `shared-cpu-2x` / 2GB,
  `min_machines_running = 1`. Add web headroom with `fly scale count web=N`.
- **`fly.staging.toml`** — staging (`app = "statuslines-staging"`): `shared-cpu-1x` / 512MB,
  `min_machines_running = 0` — the web process scales to zero when idle. Stopping can cut a render
  off; the next drain after the 15-minute limit re-queues it.

Fly can't include one file from another, so `[build]`, `[processes]`, `[http_service]` port, and
`[deploy]` are duplicated in both — a header comment in each lists what must stay in sync. Only the
`[[vm]]` size/memory and `min_machines_running` differ on purpose.

**Why two files instead of `fly scale vm`:** a `fly scale vm` / `fly scale memory` change is **reset
on the next deploy** whenever a `[[vm]]` block is in the config. Prod ships by promoting the staging
image, so that promote would shrink prod back every time — the size has to live in the config file.
The sizing rationale: local repeated-wave profiling reproduced large transient SSR peaks before
delayed collection. The 2GB allocation provides operational headroom; the lower `soft_limit` makes
Fly add a machine before the box is in trouble.

## Deploying

Staging:
```sh
bun run deploy:staging
```
This command reads every production machine's full image reference and requires unanimous agreement
on the registry, repository, and digest. It then passes that exact reference to the staging build as
`PREVIOUS_IMAGE`. Missing, malformed, or mixed production images abort before `fly deploy`; do not
replace this command with a direct staging deploy, because doing so drops the previous generation
that the Docker build uses to retain hashed assets.

The `release_command` in the Fly config runs `bun run src/db/migrate.ts` against that env's DB before
the new version goes live. That script applies migrations via `drizzle-orm`'s runtime migrator
(`drizzle-orm/postgres-js/migrator`) reading the committed `drizzle/` SQL folder — it does **not**
use the `drizzle-kit` CLI. So the only things the image must keep are `drizzle-orm` (a runtime
dependency, never pruned) and the `drizzle/` folder (copied in) — verify the `drizzle/` copy
survives when editing the generated Dockerfile.

**One-time backfill for the `configs.all_tags` release (migration `0018`):** the migration adds the
column with a `'[]'` default, so **existing** published configs start with an empty `all_tags` until
it's populated. Every read path (facet pages, the home tag filter, the sitemap/llms facet list) now
derives from `all_tags`, so until the backfill runs the live facet pages 404 and the tag filter
matches nothing. Immediately after the migrate (before considering the env live), run the pure
re-derivation pass (no model call) against that env's DB:
```sh
DATABASE_URL='<env pooled url>' bun run scripts/backfill-tags.ts --all-tags
```
Run it on **staging first, then production**, same as the other backfill scripts. New submissions get
`all_tags` automatically on publish — this pass is only for rows that existed before the migration.

**One-time backfill for the `burn-rate` tag:** the `burn-rate` facet was added after its configs were
already classified, and the model classifier only (re)tags configs whose tags are still empty — so the
five existing burn-rate configs need a targeted pass. After deploying, run (dry run first, then `--write`):
```sh
DATABASE_URL='<env pooled url>' bun run scripts/tag-burn-rate.ts          # preview
DATABASE_URL='<env pooled url>' bun run scripts/tag-burn-rate.ts --write  # persist + recompute all_tags
```
Idempotent and matches by title, so it's safe to re-run. **Staging first, then production.** New
submissions get `burn-rate` from the classifier, which now knows the criterion.

**One-time backfill for the `weather` + `markets` tags:** same story — these feature facets were added
after their configs were classified, so the existing ones need a targeted pass. After deploying, run
(dry run first, then `--write`):
```sh
DATABASE_URL='<env pooled url>' bun run scripts/tag-weather-markets.ts          # preview
DATABASE_URL='<env pooled url>' bun run scripts/tag-weather-markets.ts --write  # persist + recompute all_tags
```
Idempotent, matches by title. **Staging first, then production.** New submissions get the tags from
the classifier, which now knows both criteria.

**One-time copy regeneration for the "What it does" release:** page copy is now one format for
status lines and mods (summary, steps, notes and tile wording; see "Generated page copy" in
`CLAUDE.md`). Copy stored in the old three-section format no longer renders, so after deploying,
every published status line and mod shows only its fact tiles until its copy is regenerated. Run the
workflow for both kinds against that env's DB; `--all --prepare` lists every version whose copy is
missing or in the old format:
```sh
DATABASE_URL='<env pooled url>' bun run generate:content --all --prepare
DATABASE_URL='<env pooled url>' bun run generate:content --apply          # response JSON on stdin
DATABASE_URL='<env pooled url>' bun run generate:content --all --prepare --mod
DATABASE_URL='<env pooled url>' bun run generate:content --apply --mod    # response JSON on stdin
```
**Staging first, then production.** Rerun `--all --prepare` (and `--mod`) afterwards: it prints `[]`
once nothing is left.

Promote to production with the **gated** command — never promote by hand:
```sh
bun run deploy:prod
```
`scripts/deploy-prod.ts` gates the promotion as one operation:

1. It saves the current production asset URLs referenced by `/`, `/resources`, `/terms`, and one
   linked `/c/<slug>` detail page.
2. It runs a real-browser smoke against staging. The browser requires the expected homepage title,
   exact root canonical, H1, and non-error body; it also fetches every same-origin initial script,
   stylesheet, and modulepreload and requires at least one and success for all.
3. It requests every saved production asset from staging and requires status 200, a file-extension
   appropriate non-HTML content type/body, and one-year immutable caching without contradictory
   `no-cache` or `no-store` directives. Every required production page must reference at least one
   qualifying same-origin asset.
4. Immediately before promotion it re-reads both production and staging image references. Either
   changing during validation aborts. The exact staging image is promoted by digest, without a
   rebuild.
5. After promotion, every saved asset must pass the same status, type/body, and caching checks on
   production.

**Why this is mandatory, not optional:** every source gate (tsc/lint/vitest) passes while the client
bundle is dead — a server-only import leaking into the browser throws `Buffer is not defined`,
hydration fails, every button goes dead, and SSR still returns 200 so nothing alerts. That shipped
to prod for ~2.5h on 2026-06-29. Staging runs the **exact same image** we promote, so smoking staging
smokes the real production bundle. The smoke uses the signed-out checks only (the signed-in half mints
a session against the local dev DB, which staging doesn't share). **Do not** run the two `fly deploy`
commands by hand and skip the smoke — that's the hole that let the crash ship.

## Mods

Mods are Claude Code plugins listed in `/marketplace.json` and shown at `/mods/<slug>`. The slug is
the curated `pluginName`. Every script below prints its full usage in its header comment.

### The mods E2B template

Mods render in their own E2B template, separate from the status line template:
```sh
bun run build:e2b-mod-template
```
It prints an immutable snapshot ID. Commit that value as `E2B_MOD_TEMPLATE_ID` in
`src/render/e2b-template.ts` before deploying. Rebuild only when the Claude Code or headless-terminal
version in `scripts/build-e2b-mod-template.ts` changes. It leaves `E2B_TEMPLATE_ID` alone.

### The Desktop E2B template

Claude Desktop previews render in a third template, with Claude Desktop for Linux and its bundled
engine on a virtual display (ADR 0004):
```sh
bun run scripts/build-e2b-desktop-template.ts
```
Commit what it prints as its header comment says. Rebuild it only for a Desktop upgrade (below).

### Desktop upgrade runbook

The Desktop recorder drives the session by clicking fixed screen positions, so a new Claude Desktop
can move what it clicks. For each Desktop upgrade:
1. Bump the Desktop version in `scripts/build-e2b-desktop-template.ts`, rebuild the template and
   commit its new ID.
2. Check that the scripted clicks still land:
   ```sh
   bun run smoke:desktop
   ```
3. Re-render every mod (launch runbook step 3) on staging, then production, so each Desktop preview
   comes from the new Desktop.

### Launch runbook

Run every step against **staging first, then production**, from your machine. `<env pooled url>` is
that environment's `DATABASE_URL`. The import and render steps also need `E2B_API_KEY`.

1. Apply the migrations (`0026` to `0030` add the mods tables and the Desktop previews, plus anything
   newer). `0031` deletes Desktop shots recorded before each shot had a card image, so run step 3
   again after it. The deploy's `release_command` already applies them, so on a deployed environment
   this only confirms it:
   ```sh
   DATABASE_URL='<env pooled url>' bun run db:migrate
   ```
2. Import the curated mods in `src/mods/curation.json` as drafts. Rerunning skips mods already
   imported at the same commit:
   ```sh
   DATABASE_URL='<env pooled url>' bun run import:mods
   ```
3. Render each mod's previews. One run records every mod in the terminal and in Claude Desktop and
   prints one outcome per mod per surface: rendered, drew nothing, or failed. A failed surface keeps
   its earlier result and leaves the other surface alone. Exit code 1 means a surface failed; rerun
   it, or a single mod with `--slug <slug>`. A mod publishes only once both surfaces have a result:
   ```sh
   DATABASE_URL='<env pooled url>' bun run render:mods
   ```
   `bun run dev` shows the stored Desktop images on mod pages and cards, like staging and production.
4. Generate the page copy. `--all --prepare --mod` prints a request for every draft and published
   mod without content in the current format. Answer it per the "Generated page copy" convention in `CLAUDE.md`, and send
   the response JSON to apply on stdin, without writing it to a file:
   ```sh
   DATABASE_URL='<env pooled url>' bun run generate:content --all --prepare --mod
   DATABASE_URL='<env pooled url>' bun run generate:content --apply --mod   # response JSON on stdin
   ```
5. Publish each mod. `<sha>` is the entry's `commitSha` in `src/mods/curation.json`. Run the dry
   run first and read its WARN lines, then apply with the slug typed back:
   ```sh
   DATABASE_URL='<env pooled url>' bun run scripts/publish-mod.ts <slug> <sha>
   DATABASE_URL='<env pooled url>' bun run scripts/publish-mod.ts <slug> <sha> --apply --confirm=<slug>
   ```
   To move a published mod to a newer commit, follow "Re-pin a mod" below.

### Re-pin a mod

An update is a new version of the mod. The current version stays live until you publish the new
one. Run every step against staging first, then production.

1. In `src/mods/curation.json`, change the entry's `commitSha` (and `inputSteps` if the new version
   needs them). Keep `pluginName` and `repoUrl`: the import refuses a re-pin to another repository.
   The mod's title and description stay as they were first imported.
2. Import it. The import adds the commit as the mod's next version and leaves the current one live:
   ```sh
   DATABASE_URL='<env pooled url>' bun run import:mods
   ```
3. Render it. `render:mods` renders each mod's current version and, when there is a newer one, its
   newest version, printed as `<slug> v<n> (not current)`, in the terminal and in Claude Desktop.
   Publishing refuses a version without a result on both:
   ```sh
   DATABASE_URL='<env pooled url>' bun run render:mods --slug <slug>
   ```
4. Publish it with the new `commitSha`. The dry run lists the files changed since the live commit
   and warns when the footprint grows or plugin.json's `version` is unchanged (existing installs
   then won't update). Read it, then apply:
   ```sh
   DATABASE_URL='<env pooled url>' bun run scripts/publish-mod.ts <slug> <sha>
   DATABASE_URL='<env pooled url>' bun run scripts/publish-mod.ts <slug> <sha> --apply --confirm=<slug>
   ```
5. Generate the page copy again, as in step 4 of the launch runbook: the newly current version
   starts with none, so the mod page's "What it does" card shows only its fact tiles until you do.

### Emergency delist

Delisting removes a mod from `/marketplace.json`. The marketplace sets `forceRemoveDeletedPlugins`,
so **delisting uninstalls the mod for every subscriber** at their next session start. Restoring
re-lists it but reinstalls it for no one.
```sh
fly ssh console --app statuslines --command "bun run scripts/delist-mod.ts <slug> --confirm=<slug>"
fly ssh console --app statuslines --command "bun run scripts/delist-mod.ts <slug> --restore --confirm=<slug>"
```

### Pinned-commit check

Claude Code installs each mod from the commit the marketplace pins. A force-pushed or deleted commit
breaks every new install. `scripts/check-mods.ts` lists each published mod whose commit GitHub no
longer serves, and exits 1 when any is missing:
```sh
fly ssh console --app statuslines --command "bun run scripts/check-mods.ts"
```
Re-pin a listed mod to a fetchable commit (see "Re-pin a mod"), or delist it.

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
   Then edit `fly.toml` for the `web` process group + `release_command`, and the `Dockerfile` for
   the migration caveat above. Add `.dockerignore`.
4. Set staging secrets (`fly secrets import --app statuslines-staging < .env.staging`).
5. `fly deploy --config fly.staging.toml`; verify on the `*.fly.dev` URL, then point `staging`
   DNS in Cloudflare and verify on `staging.statuslin.es`.
6. Shake out kinks on staging.
7. Create the prod app + OAuth app; set production secrets; promote the validated image; point
   apex DNS; verify the full signed-in round trip on `statuslin.es`.

## Render-queue alerts (PostHog)

The web server's render drain emits two PostHog events the maintainer can alert on. Both are
**fail-soft and prod-only**: `captureServerEvent` is a no-op without a `POSTHOG_PROJECT_TOKEN`, so
local and staging never emit them. Both use `distinctId: 'render-worker'`, kept from the old worker
so the history stays one series.

- **`render_queue_drained`** — emitted at the end of every drain, with
  `{ processed, cutOffJobs, queuedRemaining, oldestQueuedAgeSec }`. `cutOffJobs` counts the jobs this
  drain found `running` past the 15-minute limit and put back.
- **`statusline_render_completed`** — emitted once per render job, with
  `{ outcome, errorClass?, durationMs, configId, versionId, slug }`. `outcome` is `'failure'` when the
  job threw (`errorClass: 'job_failed'`) or any scenario hit a sandbox error, timed out, or exited
  non-zero (`'sandbox_error'` / `'timeout'` / `'nonzero_exit'`). Never carries script output.
  `sandbox_error` keys off the runner's infra exit code (125), which a script can also return
  itself, so don't alert on it as a pure infra signal.

A drain that throws (database or E2B unreachable, `E2B_API_KEY` missing) goes to PostHog error
tracking with `source: 'render-drain'`, and to the server log.

### PostHog alert facts (verified against the docs, 2026-06-25)

- Alerts attach only to **trends** insights (not funnels/retention).
- Check interval options: **every 15 min** (requires a paid Boost/Scale/Enterprise plan), **hourly**,
  daily, weekly, monthly. On the free plan the floor is **hourly**.
- Insight-based alerts are **delayed up to ~1 hour** regardless of the check interval (PostHog's own
  caveat) — so treat detection latency as roughly an hour, not the window size. For a faster signal
  you'd need a different mechanism (e.g. an external uptime check), out of scope here.
- Notify via email, Slack, Discord, or webhook. These email the maintainer.

### The alert

**Queue stuck** — trends insight on `render_queue_drained` with two series, and one alert on each →
email:

- **max(`oldestQueuedAgeSec`)** over the **last 30 minutes**; alert when **> 900** (15 min of the
  oldest queued job sitting unrendered).
- **sum(`cutOffJobs`)** over the **last hour**; alert when **> 0** (a render sat `running` for 15
  minutes after its machine crashed).

Drains run only on submissions, admin actions and machine starts, so this catches a drain that
leaves old jobs behind or finds a stuck render, not a queue nothing drains.

Create it in the PostHog UI (insight → Alerts → New alert) or via the PostHog MCP. Re-create it from
this section if the project is ever rebuilt. The old **Worker down** alert counted
`render_worker_heartbeat`, which no longer exists; delete it, or it emails on every check.

## Not yet (later)

- GitHub Action: auto-deploy staging on merge to main, manual approval to promote to prod.
