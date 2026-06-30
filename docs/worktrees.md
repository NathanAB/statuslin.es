# Working in a git worktree

Agents sometimes isolate a task in a git worktree (e.g. via the `EnterWorktree` tool or the
`superpowers:using-git-worktrees` skill). On this repo the native tool creates the worktree under
`.claude/worktrees/<name>/` — i.e. **nested inside the main repo's own directory tree**. That
nesting causes a few sharp edges. This doc is the checklist so the next agent doesn't rediscover
them.

## First-time setup inside a fresh worktree

A worktree is a separate working directory. It does **not** inherit the main checkout's
`node_modules` or its gitignored `.env*` files. Before anything will run:

1. `bun install` — worktrees have no `node_modules`.
2. Copy the local env in: `cp <main-repo>/.env.local <worktree>/.env.local`. Without it, every
   DB-backed test fails with `Missing required environment variable: DATABASE_URL` (the test DB is
   PGlite, but `src/db/index.ts` reads `DATABASE_URL` at import). `.env.local` is gitignored, so it
   is never copied automatically.
3. Baseline the suite from the worktree root: `bun --bun run test`. Expect it green before you start.

## Run the gate from the worktree root, not the main repo

**Always run `bun run check` (and any `biome` / `vitest` / `tsc` command) with the worktree as the
current directory.** From the worktree root everything works normally. From the *main* repo root,
Biome walks down into `.claude/worktrees/<name>/` and finds a second `biome.json`, then aborts with:

```
× Found a nested root configuration, but there's already a root configuration.
```

`.claude/worktrees/` is gitignored (see `.gitignore`) specifically so the main repo's whole-tree
`biome check .` skips worktrees and doesn't hit this. But the rule of thumb stands: **gate from the
worktree.**

## The per-edit hook noise (and why it's now fixed)

Claude Code's hooks are loaded from `$CLAUDE_PROJECT_DIR`, which points at the **main** repo even
during a worktree session. The PostToolUse hooks (`format-on-edit.sh`, `frontend-gate.sh`) used to
`cd "$CLAUDE_PROJECT_DIR"` (main repo) and then run `biome check <worktree-file>` — triggering the
nested-root abort on **every single edit** to a `src/**/*.ts(x)` file. The edit itself still applied
(PostToolUse runs *after* the tool and does not revert), but each edit printed a scary BLOCKED error.

Fix applied: both hooks now derive the directory to run Biome in from the **edited file's own git
toplevel** instead of `CLAUDE_PROJECT_DIR`:

```sh
hook_root=$(git -C "${path%/*}" rev-parse --show-toplevel 2>/dev/null || printf '%s' "${CLAUDE_PROJECT_DIR:-.}")
cd "$hook_root" || exit 0
```

In a worktree this resolves to the worktree root (where Biome is happy); in the main repo it
resolves to the same place as before. **Caveat:** the *running* hooks come from the main checkout's
copy, so this fix only takes effect once it is merged to `main`. Until then, the BLOCKED messages on
edits inside a worktree are expected noise — keep working and gate from the worktree root.

## Known gap: the Stop self-gate checks the main repo, not the worktree

`agent-gate.sh` (the `Stop` hook that re-runs typecheck/lint/front-end when an agent finishes a turn
with uncommitted `.ts`/`.tsx` changes) also `cd`s to `$CLAUDE_PROJECT_DIR` (main repo). In a
worktree session this means the self-gate inspects the **main** checkout — which is usually clean —
and passes trivially, so it never actually gates the worktree's changes. It is a missing safety net,
not a wrong result: always run `bun run check` from the worktree root yourself before claiming green.

This one is left unchanged on purpose: unlike the per-edit hooks, the Stop hook has no edited-file
path to anchor on, so the safe fix depends on what working directory Claude Code runs `Stop` hooks
in. If that is the worktree (likely, since the session's cwd is the worktree), the fix is to anchor
on the current directory's toplevel:

```sh
gate_root=$(git rev-parse --show-toplevel 2>/dev/null || printf '%s' "${CLAUDE_PROJECT_DIR:-.}")
cd "$gate_root" || exit 0
```

Verify the `Stop`-hook working directory before applying that.

## Pushing from a worktree

Worktrees share git hooks with the main repo but have no `node_modules`, so the `pre-push` hook
(`yarn git:pre-push` / `bun run check:ci`) fails. Push with `SKIP_SIMPLE_GIT_HOOKS=1 git push` and
make sure you have already run `bun run check` from the worktree root (the real gate).
