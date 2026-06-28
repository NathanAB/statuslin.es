#!/usr/bin/env bash
# Agent self-enforcement: when an agent finishes a turn with uncommitted UI/route changes,
# run the browser smoke (scripts/smoke.ts) and BLOCK finishing if it's red. This is the
# mechanical version of "verify in a real browser" — source gates (tsc/lint/vitest) pass while
# the client bundle is dead, so an agent could otherwise claim done on a page that never hydrates.
# See the 2026-06-13 hydration-crash incident.
#
# Wired from .claude/settings.json as a Stop hook. Exit 2 = block + show stderr to the agent.
# Requires: agent-browser installed + dev DB migrated with an admin user (same as `bun run smoke`).
# Reuses a dev server already on BETTER_AUTH_URL; otherwise smoke boots a throwaway one.
set -uo pipefail

input=$(cat 2>/dev/null || true)

# Loop guard: don't re-block inside a stop-hook continuation.
if printf '%s' "$input" | grep -q '"stop_hook_active"[[:space:]]*:[[:space:]]*true'; then
  exit 0
fi

cd "${CLAUDE_PROJECT_DIR:-.}" || exit 0

# Only gate when there are uncommitted front-end changes (a route, ui primitive, or feature .tsx).
if ! git status --porcelain 2>/dev/null \
  | grep -qE 'src/(routes|ui|gallery|submit|review|adopt|votes)/.*\.tsx$'; then
  exit 0
fi

# The smoke drives a real browser via agent-browser. If it isn't installed, skip with a warning
# instead of blocking — a fresh contributor shouldn't be stuck on a tool they don't have. Maintainers
# who have agent-browser installed still get the hard gate.
if ! command -v agent-browser >/dev/null 2>&1; then
  echo "browser-verify: agent-browser not installed — skipping the browser smoke. Install it (and run 'bun run db:migrate' on the dev DB) to enable this check." >&2
  exit 0
fi

if ! out=$(bun run smoke 2>&1); then
  echo "Self-gate BLOCKED: browser smoke is red — you changed UI but it doesn't work in a real browser. Fix it, or run 'bun run smoke' to see the failures." >&2
  printf '%s\n' "$out" | tail -25 >&2
  exit 2
fi

exit 0
