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
export const MINIMAL_SCRIPT_OUTPUT = '[Opus 5.5] app · 22% context'

/** The settings.json wiring, exactly as the official docs specify. */
export const SETTINGS_SNIPPET = `{
  "statusLine": {
    "type": "command",
    "command": "~/.claude/statusline.sh"
  }
}`

/** What each documented top-level field holds, worded from the official docs, in
 * SAMPLE_STDIN_JSON's order. The fields the sample doesn't send come last and say when they appear. */
export const STDIN_FIELD_GUIDE: Array<{ label: string; value: string }> = [
  { label: 'session_id', value: 'Unique ID for this session.' },
  { label: 'transcript_path', value: "Path to the session's transcript file." },
  { label: 'fast_mode', value: 'Whether fast mode is on.' },
  { label: 'version', value: 'Claude Code version.' },
  { label: 'cwd', value: 'Same value as workspace.current_dir.' },
  {
    label: 'prompt_id',
    value: 'ID of the prompt being processed. Absent until your first prompt.',
  },
  { label: 'model', value: 'id and display_name.' },
  { label: 'effort', value: "Reasoning effort level. Absent when the model doesn't support it." },
  { label: 'thinking', value: 'Whether extended thinking is on.' },
  {
    label: 'workspace',
    value: 'current_dir, project_dir and added_dirs, plus repo and git_worktree when they apply.',
  },
  {
    label: 'cost',
    value: 'Session cost, duration, and lines added and removed. Most scripts show total_cost_usd.',
  },
  {
    label: 'context_window',
    value: 'Token counts and used_percentage, which can be null early in a session.',
  },
  { label: 'exceeds_200k_tokens', value: 'Whether the last response passed 200k tokens.' },
  {
    label: 'prompt_cache',
    value:
      "The main conversation's prompt cache: whether it's warm, hit_ratio, misses, when it expires, and more. Absent until the first response.",
  },
  {
    label: 'rate_limits',
    value:
      'five_hour and seven_day windows on Pro and Max plans, or spend_limit behind a Claude apps gateway, each with used_percentage and resets_at in unix seconds. spend_limit can add used_usd, limit_usd and period. Appears after the first response, and a window drops out once its resets_at passes.',
  },
  { label: 'output_style', value: "The current output style's name." },
  {
    label: 'pr',
    value:
      'Open PR\'s number, url and review_state, when the branch has one. For a GitLab merge request, kind is "mr".',
  },
  {
    label: 'session_name',
    value:
      'The name from --name or /rename, else the AI-generated title. Absent until there is one.',
  },
  { label: 'vim', value: 'The vim mode, such as NORMAL or INSERT, when vim mode is on.' },
  { label: 'agent', value: "The agent's name, when running with --agent or agent settings." },
  {
    label: 'worktree',
    value: 'name, path, branch, original_cwd and original_branch, during a worktree session.',
  },
]
