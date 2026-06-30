#!/usr/bin/env bash
# PostToolUse: check the just-edited front-end file for design-system violations
# immediately after each edit, so drift is caught per-edit rather than only at
# the Stop gate or pre-commit.
#
# Runs two checks:
#   1. bunx biome check <file>   — lint + format compliance on the single file
#   2. bun run scripts/check-frontend.ts — design-system gate (walks all of src/)
#
# Only fires on .ts/.tsx files under src/; exits 0 (no-op) for everything else.
# Exit 2 = block the tool result and feed stderr back to the agent (Claude Code
# PostToolUse convention) so it self-corrects before moving on.
set -uo pipefail

input=$(cat 2>/dev/null || true)
path=$(printf '%s' "$input" \
  | python3 -c 'import sys,json
try:
    print(json.load(sys.stdin).get("tool_input",{}).get("file_path",""))
except Exception:
    print("")' 2>/dev/null)

# No path → nothing to check.
[ -z "$path" ] && exit 0

# Only gate on .ts/.tsx files under src/.
case "$path" in
  *.ts | *.tsx) ;;
  *) exit 0 ;;
esac

# Must be under the src/ directory (absolute or relative path).
case "$path" in
  */src/*) ;;
  *) exit 0 ;;
esac

# Skip generated files (same list as format-on-edit.sh).
case "$path" in
  *routeTree.gen.ts | */src/db/auth-schema.ts | */drizzle/*) exit 0 ;;
esac

# Run Biome from the edited file's own repo root. In a git worktree (nested under
# .claude/worktrees/), CLAUDE_PROJECT_DIR is the MAIN repo, and running Biome there makes it treat
# the worktree's biome.json as a nested project root and abort. Anchoring on the file's git toplevel
# uses the worktree's own config; in the main repo this resolves to the same dir as before.
hook_root=$(git -C "${path%/*}" rev-parse --show-toplevel 2>/dev/null || printf '%s' "${CLAUDE_PROJECT_DIR:-.}")
cd "$hook_root" || exit 0

violations=""

# 1. Biome lint+format check on the single file.
if ! biome_out=$(bunx @biomejs/biome check "$path" 2>&1); then
  violations="${violations}Biome violation in ${path}:\n${biome_out}\n"
fi

# 2. Design-system gate (walks all of src/ — fast, ~ms).
if ! ds_out=$(bun run scripts/check-frontend.ts 2>&1); then
  violations="${violations}${ds_out}\n"
fi

if [ -n "$violations" ]; then
  printf 'front-end gate BLOCKED\n%b\n' "$violations" >&2
  exit 2
fi

exit 0
