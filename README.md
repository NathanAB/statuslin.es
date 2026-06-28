# statuslin.es

A community gallery of [Claude Code](https://claude.com/claude-code) status lines. Browse real configs as
**rendered previews**, upvote the good ones, and copy one to your terminal. You see what each script
actually renders to before you copy it, instead of guessing from the source.

Live at **[statuslin.es](https://statuslin.es)**.

## How it works (and why it's safe)

A status line is an arbitrary script Claude Code runs to draw the bottom strip of your terminal, so this
site hosts and runs strangers' shell scripts. The safety model is the whole point:

- **Your code runs once, at submit time. Not on page views.** A submitted script runs a single time in a
  fresh [E2B](https://e2b.dev) sandbox with **no network access by default**, a **hard 5-second timeout**,
  and only `COLUMNS`/`LINES` passed in; then the sandbox is destroyed. (A script may declare network hosts
  it needs; those submissions are held for human review and rendered behind an egress allowlist.) Browsing
  the gallery serves pre-rendered HTML — no submitted script runs when you visit.
- **A human reviews every config before it's published.** Rendered previews land in a review queue;
  nothing goes live automatically.
- **Published versions are pinned to a content hash and immutable.** The exact reviewed bytes are what
  gets served and copied. There's no path to swap in unreviewed code after approval.

## Stack

Bun · Vite · TanStack Start (React SSR) · Better Auth (GitHub) · Drizzle + Postgres · E2B.

This is an **agent-first** codebase: most changes are written by AI agents against mechanical gates
(typecheck, lint, tests, git hooks). [`CLAUDE.md`](./CLAUDE.md) holds the conventions;
[CONTRIBUTING.md](./CONTRIBUTING.md) is how to get started.

## Local development

Prereqs: [Bun](https://bun.sh) and Docker. Then `bun install`.

### 1. Local Postgres

There's no hosted dev database. Local dev runs against its own throwaway Postgres container. Port
`5433` (host) so it won't clash with anything already on `5432`:

```sh
docker run -d --name statuslines-postgres \
  -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=statuslines \
  -p 5433:5432 postgres:17
```

Later, start/stop it with `docker start statuslines-postgres` / `docker stop statuslines-postgres`.

### 2. Env (`.env.local`)

Copy `.env.example` to `.env.local`. Bun auto-loads it, and it's the only env file the local app
reads. (`.env.staging` / `.env.production` are just the source you push to Fly secrets; see
[`docs/deploy.md`](./docs/deploy.md).)

```sh
DATABASE_URL=postgresql://postgres:postgres@localhost:5433/statuslines
BETTER_AUTH_URL=http://localhost:3100
BETTER_AUTH_SECRET=        # openssl rand -base64 32
GITHUB_CLIENT_ID=          # your dev GitHub OAuth app (callback http://localhost:3100/api/auth/callback/github)
GITHUB_CLIENT_SECRET=
# E2B_API_KEY is optional locally; without it, submitted scripts render with the fake runner.
```

### 3. Schema, run, seed

```sh
bun run db:migrate     # create the schema in the local DB
bun run dev            # http://localhost:3100
```

Sign in once with GitHub to create your user, then (optionally) `bun run seed:gallery` for sample
configs. It needs an existing user to author them, so it must come after the first sign-in.

### 4. The gate

Run before every commit (also enforced by git hooks):

```sh
bun run check          # typecheck + lint + test
```

Tests use PGlite against the real committed migrations, so they don't need the container running.

## Contributing

Code contributions are welcome. See [CONTRIBUTING.md](./CONTRIBUTING.md). To share a status line you
don't need this repo: submit it on [statuslin.es](https://statuslin.es). Found a security issue? See
[SECURITY.md](./SECURITY.md).

## License

[MIT](./LICENSE).
