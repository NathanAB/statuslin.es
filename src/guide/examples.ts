import { resolveResets } from '@/render/scenario-helpers'
import { SCENARIOS } from '@/render/scenarios'

/**
 * Everything the /guide page shows as an example, in one place so the page
 * component stays small and every example is testable:
 * - SAMPLE_STDIN_JSON is DERIVED from src/render/scenarios.ts (whose tests enforce
 *   coverage of every field Claude Code sends), never hand-written.
 * - MINIMAL_SCRIPT is executed by test/guide/examples.test.ts against real payloads.
 * - SETTINGS_SNIPPET matches the official docs (code.claude.com/docs/en/statusline).
 */

/** Fixed "now" for resolving rate-limit reset offsets into absolute epochs, so the
 * rendered example is deterministic. 2026-06-21T00:26:40Z — any constant works. */
const SAMPLE_NOW_EPOCH = 1_782_000_000

const cleanMain = SCENARIOS.find((s) => s.key === 'clean-main')
if (!cleanMain) throw new Error('clean-main scenario missing from SCENARIOS')

/** The full JSON Claude Code pipes to a status line script, pretty-printed. */
export const SAMPLE_STDIN_JSON = JSON.stringify(
  resolveResets(cleanMain.stdin, SAMPLE_NOW_EPOCH),
  null,
  2,
)

/** A minimal working status line: model, directory basename, context usage. */
export const MINIMAL_SCRIPT = `#!/bin/bash
input=$(cat)
model=$(jq -r '.model.display_name' <<<"$input")
dir=$(jq -r '.workspace.current_dir' <<<"$input")
pct=$(jq -r '.context_window.used_percentage // 0' <<<"$input")
echo "[$model] \${dir##*/} · \${pct}% context"
`

/** What MINIMAL_SCRIPT prints for SAMPLE_STDIN_JSON (asserted by the test suite). */
export const MINIMAL_SCRIPT_OUTPUT = '[Opus 4.8] app · 22% context'

/** The settings.json wiring, exactly as the official docs specify. */
export const SETTINGS_SNIPPET = `{
  "statusLine": {
    "type": "command",
    "command": "~/.claude/statusline.sh"
  }
}`
