# Contributing

Thanks for your interest in statuslin.es.

Two different things get called "contributing" here, and they go to different places:

- **Sharing a status line config?** You don't need this repo. Submit it on
  [statuslin.es](https://statuslin.es): sign in with GitHub, paste your script, and it gets rendered and
  reviewed. (A maintainer reviews every submission and may decline; see [On "no"](#on-no) below.)
- **Changing the code?** That's what this guide covers. Bug fixes, features, and docs are all welcome.

## Getting started

Local setup (Bun, Docker, and a free GitHub OAuth app) is in the
[README](./README.md#local-development). `E2B_API_KEY` is optional: without it, submitted scripts render
with a built-in fake runner, so you can run and test the whole app locally for free.

## The gate

Every change passes the same gate, enforced by git hooks (and by every agent on itself):

```sh
bun run check          # typecheck + lint + test
```

It has to be green before you commit. Don't bypass the hooks (no `--no-verify`). New behavior is written
test-first (red → green → refactor); the testing rules are in [`CLAUDE.md`](./CLAUDE.md).

## Conventions

- **Commits:** [Conventional Commits](https://www.conventionalcommits.org) (`feat` / `fix` / `chore` /
  `docs` / `refactor`), small and focused.
- **This is an agent-first codebase.** Most changes are written by AI agents against the mechanical gates
  above. [`CLAUDE.md`](./CLAUDE.md) is the source of truth for conventions: the design system, env rules,
  and file layout. Skim it before anything non-trivial.
- Keep pull requests small and single-purpose, and match the style of the code around you.

## Working with Claude Code

This repo ships its Claude Code setup in [`.claude/`](./.claude), so if you use Claude Code you inherit
the same tooling the maintainer uses — no setup needed:

- **Review agents** (`.claude/agents/`): a `frontend-reviewer` and a `security-reviewer` scoped to this
  project's rules. Ask Claude to run them on your change.
- **Gate hooks** (`.claude/hooks/`): they auto-format on edit, block hand-edits to generated files, and
  block finishing a turn while typecheck / lint / the design-system gate is red — so an agent can't quietly
  wrap up on a broken build.
- **Recommended MCP servers** (`.mcp.json`): Context7 (current library docs — this repo runs release-
  candidate and beta libraries where model memory is stale) and shadcn. Claude Code asks you to approve
  them when you open the project.

Two optional local tools make the hooks fully effective:

- **`agent-browser`** — the `browser-verify` hook drives a real browser to confirm UI changes actually
  render. Without it installed, that hook skips with a warning (it won't block you). Install it (and run
  `bun run db:migrate` on your dev DB) to enable it.
- **`python3`** — the edit hooks use it to parse hook input; if it's missing they no-op silently.

Personal Claude Code settings go in `.claude/settings.local.json` (gitignored) — don't commit machine-
specific config to the shared `.claude/settings.json`.

## Security-sensitive areas

The E2B sandbox, the submit/render pipeline, and authentication are what keep untrusted scripts from
doing harm, so changes there get extra scrutiny. **Don't open a public issue or pull request for a
vulnerability.** Report it privately per [SECURITY.md](./SECURITY.md).

## On "no"

This is a small, solo-maintained project with an opinionated design. A maintainer may decline a pull
request or a submitted config, hopefully kindly. For anything large, open an issue to talk it through
first; it saves everyone time.
