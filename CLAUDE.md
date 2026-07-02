# statuslin.es

Community gallery of Claude Code status lines — browse configs as rendered previews, upvote, and copy one to use.

> **This is an agent-first codebase.** Most changes are written by AI agents. The standards below are enforced mechanically (linter, typecheck, tests, git hooks, CI) **and** by every agent on itself. Do not bypass the gates — no `git commit --no-verify`, no skipping tests, no claiming "done" without showing green output in the same message.

## Stack

Bun (runtime + toolchain) · Vite · TanStack Start (React, SSR) · Better Auth (GitHub) · Drizzle + Postgres · E2B (untrusted-script sandbox). Dependencies are pinned **exact** — no `^` ranges (TanStack Start is RC, Nitro is beta). Upgrades are deliberate, smoke-tested events, never incidental.

## Architecture

The lifecycle of a config: **submit** (`src/submit`) → a render job is **queued** → the
`worker` renders it in the E2B sandbox (`src/render`) → it lands in the **review queue**
(`src/review`) → an admin publishes → it appears in the **gallery** (`src/gallery`),
where visitors **upvote** (`src/votes`) and **copy it to use** (`src/adopt`).

`src/` map (one responsibility each):
- `routes/` — TanStack Start file-based routes: pages + API handlers
- `submit/` — submission form + flow (slug, obfuscation checks, allowed network hosts)
- `render/` — render pipeline: real E2B runner, fake runner (tests/no key), ANSI parsing, scenarios
- `review/` — admin review queue and publish/reject decisions
- `gallery/` — gallery list queries
- `votes/` — upvoting · `adopt/` — copy/install a config
- `og/` — Open Graph card images · `legal/` — terms page
- `db/` — Drizzle schema + migration client · `lib/` — shared utils (`env.ts`)
- `ui/` — closed design-system components · `styles/` — tokens (`app.css`)
- `server/` — Nitro server plugins (error context, PostHog)

## The quality bar — non-negotiable

1. **TDD.** Red → green → refactor for all new behavior. Write the failing test first and confirm it fails for the *right reason*. Deviations are allowed only for pure config, pure type definitions, or mechanical refactors covered by existing tests — and you must state the category out loud before deviating.
2. **Run the gate before every commit, show the evidence.** `bun run check` (typecheck + lint + test) must be green, and the output must appear in the same message as any "done / passing / fixed" claim. A run from three messages ago does not count.
3. **Single source of truth (DRY).** No magic strings or numbers duplicated across files. Environment-specific config — URLs, ports, secrets — lives in exactly one place (env vars); everything else derives from it. *(Incident 2026-05-29: `localhost:3000` was hardcoded in four files; now `BETTER_AUTH_URL` is the only source and the dev port + auth origins derive from it.)*
4. **YAGNI.** Build only what the spec/plan specifies. No speculative features, flags, or abstractions.
5. **Small, focused files.** One clear responsibility per file; split when a file starts doing too much.
6. **Clear names.** Name things for what they do, not how they work.
7. **Untrusted by default.** Submitted status line scripts are hostile until proven otherwise — the E2B sandbox is the safety boundary; trust comes from the supply-chain controls (open-source + human review + hash-pinned immutable versions + re-review on every update). See `SECURITY.md`.

## Conventions

- **Run it:** `bun run dev` (the app) + `bun run worker` (renders queued jobs locally, or nothing reaches the review queue); full setup in `README.md`.
- **Terminology — "status line" (two words):** Anthropic spells the Claude Code feature **status line** (two words), so all user-facing copy does too — "a status line", "status lines", "Status line not found". The single word "statusline" is wrong in prose. Exceptions that stay one word because they're not prose: the brand/domain **statuslin.es**, the JSON settings key `statusLine`, the docs URL path `.../statusline`, and code identifiers / filenames / analytics event names (`StatuslinePreview`, `statusline.sh`, `statusline_submitted`, …). When in doubt in anything a user reads, two words.
- **Env:** never hardcode URLs/ports/secrets. Local dev reads `.env.local` (its Postgres is a dedicated Docker container `statuslines-postgres` on host port 5433 — full setup in `README.md`); `.env.staging` / `.env.production` are push-to-Fly only (a server never reads those files). All `.env*` are gitignored except `.env.example` (the committed template) — keep it in sync. Auth is same-origin — the client infers its origin, the server reads `BETTER_AUTH_URL`.
- **Tests:** run via `bun --bun run test` (Vitest) — never bare `bun test` (it ignores the Vite config). DB tests use PGlite running the **real committed migrations**; always close clients in `afterAll`.
- **Worktrees:** if you work in a git worktree (created under `.claude/worktrees/`), `bun install` and copy `.env.local` in first, and run the gate from the worktree root — not the main repo. Per-edit Biome hook errors inside a worktree are a known papercut. Full checklist in `docs/worktrees.md`.
- **Signed-in UX testing:** auth is GitHub-only, so to test signed-in pages in an automated browser, `bun run dev:login` mints a session + prints a cookie command for agent-browser. See `docs/testing-signed-in.md`. (Apply `bun run db:migrate` to the dev DB first — PGlite-backed tests hide unapplied migrations.)
- **DB:** Drizzle; migrations via `drizzle-kit generate` → `migrate`, committed; never hand-edit generated SQL.
- **Routes:** TanStack Start file-based routes; API endpoints via `createFileRoute({ server: { handlers } })`.
- **Preview scenarios:** the stdin states a submitted status line is rendered against live in `src/render/scenarios.ts` (one row per scenario; they must cover every field Claude Code sends — `test/render/scenarios.test.ts` enforces the coverage). After changing scenarios, run **`bun run rerender:previews`** to re-render the existing gallery configs against them (uses real E2B when `E2B_API_KEY` is set, else the fake runner) — new submissions render automatically, old ones don't.
- **Generated page copy:** config pages' "What it shows / Requirements / Behavior notes" sections come from `bun run generate:content <slug>` (or `--all` to backfill), run **locally, manually** after a submission is rendered — it shells out to `claude -p` (Max plan; no API key) and writes `config_versions.generated_content`. Read the printed JSON before publishing; regenerate when a script changes. Point `DATABASE_URL` at the target env (staging first, then prod), like the other backfill scripts.
- **Front-end:** see `docs/frontend-guidelines.md` for the three rules: tokens define-once in `src/styles/app.css`; `src/ui` components are closed (no `className` prop — variants only); zero `className=` outside `src/ui` (only `Box UNSAFE_className` with a `// REASON:` comment). Every rule in that doc's enforcement table is gate-enforced at edit / Stop / commit / push.
- **Commits:** Conventional Commits (`feat` / `fix` / `chore` / `docs` / `refactor`); small and focused; only on green gates.
- **Deploy:** staging → production runbook in `docs/deploy.md`. Same image, three environments; deploy staging with `bun run deploy:staging`, then promote with the gated `bun run deploy:prod` (smokes staging in a real browser, promotes the validated image by digest). Submitted scripts only reach the review queue after the always-on `worker` process renders them — if it isn't running, render jobs sit `queued` and nothing appears for review.
- **Emergency takedown:** to pull a live config from the gallery, `scripts/remove-config.ts <slug>` flips its status `published → removed` (reversible: add `--restore`). Every read path filters `status='published'`, so it disappears from the gallery list, the page count, and its detail page at once — no migration. The `<slug>` is the last segment of `statuslin.es/c/<slug>`. Run against prod with `fly ssh console --app statuslines --command "bun run scripts/remove-config.ts <slug>"`. Full usage is in the script's header comment.

## Enforcement (the guardrails)

- **`bun run check`** — the full gate, for local use: it auto-fixes with Biome (`format`) first, then runs the strict gate (typecheck + lint + design/boundary checks + test). Run it before claiming any work complete, and show the output in the same message.
- **`bun run check:ci`** — the same gate **without** auto-fix (read-only `lint`). CI and the `pre-push` hook run this so messy committed code fails the build instead of being silently fixed in a throwaway checkout. Never point CI or hooks at `check`.
- Individual gates: **`bun run typecheck`** (tsc), **`bun run lint`** (Biome: lint + format check + import order, read-only), **`bun run format`** (Biome auto-fix), **`bun --bun run test`** (Vitest).
- **Linter/formatter — Biome** (`biome.json`): 2-space indent, single quotes, no semicolons, trailing commas, organized imports. Generated files (`routeTree.gen.ts`, `src/db/auth-schema.ts`, `drizzle/`) are excluded. Fix style with `bun run format`; never hand-fight the formatter.
- **Git hooks — simple-git-hooks:** `pre-commit` runs lint + typecheck; `pre-push` runs the full strict gate (`check:ci`). These block bad commits/pushes — **never** bypass with `git commit --no-verify`. In a worktree (no `node_modules`): `SKIP_SIMPLE_GIT_HOOKS=1 git push`.
- **Claude Code self-hook** (`.claude/settings.json`): runs the fast gate when an agent finishes work, so an agent can't quietly wrap up on red.
- **No magic-string regressions:** config (URLs, ports, secrets) comes from env via one source; reading required env vars goes through `requireEnv()` (`src/lib/env.ts`), never `process.env.X!`.
- **CI** (`.github/workflows/ci.yml`): GitHub Actions runs the full `bun run check:ci` + coverage on every push and PR. Forked PRs run without secrets (`pull_request`, all-dummy env). Branch protection: not yet (solo, agent-first) — add as contributors grow.
