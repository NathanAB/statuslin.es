#!/usr/bin/env bash
# PreToolUse guardrail: block hand-edits to generated files. Agents must
# regenerate tool output (drizzle-kit, the TanStack Start plugin, Better Auth
# CLI), never edit it by hand. Exit 2 = deny the tool call + show the reason.
set -uo pipefail

input=$(cat 2>/dev/null || true)
path=$(printf '%s' "$input" \
  | python3 -c 'import sys,json
try:
    print(json.load(sys.stdin).get("tool_input",{}).get("file_path",""))
except Exception:
    print("")' 2>/dev/null)

[ -z "$path" ] && exit 0

case "$path" in
  *routeTree.gen.ts | */src/db/auth-schema.ts | */drizzle/*.sql | */drizzle/meta/*)
    echo "BLOCKED: '$path' is generated and must not be hand-edited." >&2
    echo "Regenerate it instead: drizzle-kit generate (schema/migrations), the TanStack Start plugin (routeTree), or the Better Auth CLI (auth-schema)." >&2
    exit 2
    ;;
esac

exit 0
