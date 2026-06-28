// Shared building blocks for the statusline preview scenarios (see ./scenarios.ts).

// Model identities Claude Code reports (model.id is the resolved full id; display_name is shown).
export const OPUS = { id: 'claude-opus-4-8', display_name: 'Opus 4.8' }
export const SONNET = { id: 'claude-sonnet-4-6', display_name: 'Sonnet 4.6' }
export const HAIKU = { id: 'claude-haiku-4-5', display_name: 'Haiku 4.5' }
export const FABLE = { id: 'claude-fable-5', display_name: 'Fable 5' }

export const ENV = { COLUMNS: '120', LINES: '40' }
export const VERSION = '2.1.155'
export const REPO = { host: 'github.com', owner: 'acme', name: 'app' }
export const COST = {
  total_cost_usd: 0.41,
  total_duration_ms: 612_000,
  total_api_duration_ms: 48_000,
  total_lines_added: 128,
  total_lines_removed: 34,
}

// Always-present top-level fields, injected into every scenario so each carries the full schema.
export const SESSION = {
  session_id: 'b8e1c0d2-4a6f-4e2a-9c1b-3f5d7a9e2c10',
  transcript_path: '/home/user/.claude/projects/app/transcript.jsonl',
}

export const usage = (pct: number, size = 200_000) => ({
  context_window_size: size,
  used_percentage: pct,
  remaining_percentage: 100 - pct,
  total_input_tokens: Math.round((size * pct) / 100),
  total_output_tokens: 1_400,
  current_usage: {
    input_tokens: Math.max(0, Math.round((size * pct) / 100) - 7_000),
    output_tokens: 1_400,
    cache_creation_input_tokens: 5_000,
    cache_read_input_tokens: 2_000,
  },
})

export const emptyUsage = (size = 200_000) => ({
  context_window_size: size,
  used_percentage: null,
  remaining_percentage: null,
  total_input_tokens: 0,
  total_output_tokens: 0,
  current_usage: null,
})

// A rate-limit window. resets_at here is an OFFSET in seconds from render time; the pipeline
// (resolveResets) converts it to an absolute unix epoch when a config is rendered, so the
// countdown is always live rather than frozen at authoring time.
export const win = (pct: number, resetsInSec: number) => ({
  used_percentage: pct,
  resets_at: resetsInSec,
})

/** Seconds for `h` hours + `m` minutes — readable reset offsets in the scenarios. */
export const hm = (h: number, m: number) => h * 3_600 + m * 60

type Window = { used_percentage: number; resets_at: number }
/** Convert each rate-limit window's resets_at offset into an absolute epoch (nowSec + offset).
 * Returns a new stdin object; the shared scenario data is never mutated. */
export function resolveResets(
  stdin: Record<string, unknown>,
  nowSec: number,
): Record<string, unknown> {
  const rl = stdin.rate_limits as { five_hour?: Window; seven_day?: Window } | undefined
  if (!rl) return stdin
  const fix = (w: Window): Window => ({ ...w, resets_at: nowSec + w.resets_at })
  // Spread first so any future window (e.g. a new one_hour) is preserved, then fix the known ones.
  const next = { ...rl }
  if (rl.five_hour) next.five_hour = fix(rl.five_hour)
  if (rl.seven_day) next.seven_day = fix(rl.seven_day)
  return { ...stdin, rate_limits: next }
}
