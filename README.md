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

`.env.example` already ships with working local defaults for `DATABASE_URL` and `BETTER_AUTH_URL`, so
the only values you fill in are:

```sh
BETTER_AUTH_SECRET=        # generate with: openssl rand -base64 32
GITHUB_CLIENT_ID=          # from the GitHub OAuth app below
GITHUB_CLIENT_SECRET=      # from the GitHub OAuth app below
```

`E2B_API_KEY` is optional locally — without it, submitted scripts render with a built-in fake runner.
The dev server's port is **derived from `BETTER_AUTH_URL`**, so the default `:3100` comes from that
URL; change the URL and the port moves with it.

#### Create a GitHub OAuth app

Sign-in is GitHub-only, so local dev needs its own free OAuth app:

1. Go to **GitHub → Settings → Developer settings → OAuth Apps → New OAuth App**
   (<https://github.com/settings/developers>).
2. Fill in:
   - **Application name:** anything (e.g. `statuslines-dev`)
   - **Homepage URL:** `http://localhost:3100`
   - **Authorization callback URL:** `http://localhost:3100/api/auth/callback/github`
3. Register it, copy the **Client ID** into `GITHUB_CLIENT_ID`, then **Generate a new client secret**
   and copy it into `GITHUB_CLIENT_SECRET`.

### 3. Schema, run, seed

```sh
bun run db:migrate     # create the schema in the local DB
bun run dev            # serves on the BETTER_AUTH_URL port (default http://localhost:3100)
```

Sign in once with GitHub to create your user, then (optionally) `bun run seed:gallery` for sample
configs. It needs an existing user to author them, so it must come after the first sign-in.

Once you have a user, `bun run dev:login` mints a session and prints a cookie command so an automated
browser can test signed-in pages without going through GitHub again — see
[`docs/testing-signed-in.md`](./docs/testing-signed-in.md). (It needs an existing user, so it doesn't
replace that first GitHub sign-in.)

### 4. The gate

Run before every commit (also enforced by git hooks):

```sh
bun run check          # typecheck + lint + test
```

Tests use PGlite against the real committed migrations, so they don't need the container running.
`git push` runs this same gate plus a quick `bun run smoke`, so a green `bun run check` means you're
all but certain to pass the push hook too.

## Contributing

Code contributions are welcome. See [CONTRIBUTING.md](./CONTRIBUTING.md). To share a status line you
don't need this repo: submit it on [statuslin.es](https://statuslin.es). Found a security issue? See
[SECURITY.md](./SECURITY.md).

## License

[MIT](./LICENSE).
