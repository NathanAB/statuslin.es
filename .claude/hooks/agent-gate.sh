#!/usr/bin/env bash
# Agent self-enforcement: when an agent finishes a turn with uncommitted
# TypeScript changes, run the fast gate (typecheck + lint) and block finishing
# if it's red. Full test suite is enforced at pre-push and via `bun run check`.
#
# Wired from .claude/settings.json as a Stop hook. Exit 2 = block + show stderr
# to the agent; exit 0 = allow stop.
set -uo pipefail

input=$(cat 2>/dev/null || true)

# Loop guard: if we're already inside a stop-hook continuation, don't block again.
if printf '%s' "$input" | grep -q '"stop_hook_active"[[:space:]]*:[[:space:]]*true'; then
  exit 0
fi

cd "${CLAUDE_PROJECT_DIR:-.}" || exit 0

# Only gate when there are uncommitted .ts/.tsx changes (staged, unstaged, or new).
if ! git status --porcelain 2>/dev/null | grep -qE '\.(ts|tsx)$'; then
  exit 0
fi

if ! out=$(bun run typecheck 2>&1); then
  echo "Self-gate BLOCKED: typecheck is red with uncommitted TS changes. Fix before finishing." >&2
  printf '%s\n' "$out" | tail -15 >&2
  exit 2
fi

if ! out=$(bun run lint 2>&1); then
  echo "Self-gate BLOCKED: lint is red. Run 'bun run format', then fix what remains." >&2
  printf '%s\n' "$out" | tail -15 >&2
  exit 2
fi

# Design-system gate: catches raw colors, dead palette classes, inline styles, and
# duplicate/echoed token literals introduced via Bash edits — at Stop, not just pre-commit.
if ! out=$(bun run check:frontend 2>&1); then
  echo "Self-gate BLOCKED: front-end gate is red (design-system violation)." >&2
  printf '%s\n' "$out" | tail -15 >&2
  exit 2
fi

exit 0
