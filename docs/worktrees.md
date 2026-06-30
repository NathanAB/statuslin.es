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

## The Stop self-gate (agent-gate.sh) anchors on the payload `cwd`

`agent-gate.sh` (the `Stop` hook that re-runs typecheck/lint/front-end when an agent finishes a turn
with uncommitted `.ts`/`.tsx` changes) used to `cd "$CLAUDE_PROJECT_DIR"` — the **main** repo, even
during a worktree session. That made the self-gate inspect the main checkout (usually clean) and
pass trivially, never actually gating the worktree's changes.

Unlike the per-edit hooks, the Stop hook has no edited-file path to anchor on. Instead it reads the
`cwd` field from the hook payload Claude Code sends on stdin — verified to be the worktree root in a
worktree session — and gates that tree's git toplevel, falling back to `CLAUDE_PROJECT_DIR` only
when `cwd` is absent or not a git repo:

```sh
hook_cwd=$(printf '%s' "$input" | python3 -c 'import sys,json
try:
    print(json.load(sys.stdin).get("cwd",""))
except Exception:
    print("")' 2>/dev/null)
gate_root=$(git -C "${hook_cwd:-.}" rev-parse --show-toplevel 2>/dev/null || printf '%s' "${CLAUDE_PROJECT_DIR:-.}")
cd "$gate_root" || exit 0
```

As with the per-edit hooks, this takes effect once merged to `main` (the live hooks load from the
main checkout). Until then, still run `bun run check` from the worktree root yourself.

## Pushing from a worktree

Worktrees share git hooks with the main repo but have no `node_modules`, so the `pre-push` hook
(`yarn git:pre-push` / `bun run check:ci`) fails. Push with `SKIP_SIMPLE_GIT_HOOKS=1 git push` and
make sure you have already run `bun run check` from the worktree root (the real gate).
