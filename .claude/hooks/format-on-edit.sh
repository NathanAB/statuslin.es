#!/usr/bin/env bash
# PostToolUse: auto-format the just-edited file with Biome, so formatting is
# applied immediately and never fails later at the commit gate. Silent and
# non-blocking (always exits 0). Skips non-source and generated/ignored files.
set -uo pipefail

input=$(cat 2>/dev/null || true)
path=$(printf '%s' "$input" \
  | python3 -c 'import sys,json
try:
    print(json.load(sys.stdin).get("tool_input",{}).get("file_path",""))
except Exception:
    print("")' 2>/dev/null)

[ -z "$path" ] && exit 0

# Only format file types Biome handles.
case "$path" in
  *.ts | *.tsx | *.js | *.jsx | *.mjs | *.cjs | *.json | *.jsonc | *.css) ;;
  *) exit 0 ;;
esac

# Never touch generated files.
case "$path" in
  *routeTree.gen.ts | */src/db/auth-schema.ts | */drizzle/*) exit 0 ;;
esac

# Run Biome from the edited file's own repo root so a git worktree (nested under .claude/worktrees/)
# uses its own biome.json instead of colliding with the main repo's as a nested root. In the main
# repo this resolves to the same dir as CLAUDE_PROJECT_DIR. See docs/worktrees.md.
hook_root=$(git -C "${path%/*}" rev-parse --show-toplevel 2>/dev/null || printf '%s' "${CLAUDE_PROJECT_DIR:-.}")
cd "$hook_root" || exit 0
bunx @biomejs/biome format --write "$path" >/dev/null 2>&1 || true
exit 0
