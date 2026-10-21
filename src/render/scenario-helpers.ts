// Shared building blocks for the statusline preview scenarios (see ./scenarios.ts).

// Model identities Claude Code reports (model.id is the resolved full id; display_name is shown).
export const OPUS = { id: 'claude-opus-5-5', display_name: 'Opus 5.5' }
export const SONNET = { id: 'claude-sonnet-5-5', display_name: 'Sonnet 5.5' }
// Every Claude 5 model supports effort, so Haiku stays on 4.5 for the scenario with effort absent.
export const HAIKU = { id: 'claude-haiku-4-5', display_name: 'Haiku 4.5' }
export const FABLE = { id: 'claude-fable-5-1', display_name: 'Fable 5.1' }

export const ENV = { COLUMNS: '120', LINES: '40' }
export const VERSION = '2.1.307'
export const REPO = { host: 'github.com', owner: 'acme', name: 'app' }
export const COST = {
  total_cost_usd: 0.41,
  total_duration_ms: 612_000,
  total_api_duration_ms: 48_000,
  total_lines_added: 128,
  total_lines_removed: 34,
}

// Always-present top-level fields, injected into every scenario so each carries the full schema.
// A scenario overrides fast_mode to turn fast mode on.
export const SESSION = {
  session_id: 'b8e1c0d2-4a6f-4e2a-9c1b-3f5d7a9e2c10',
  transcript_path: '/home/user/.claude/projects/app/transcript.jsonl',
  fast_mode: false,
  version: VERSION,
}

/** The prompt being processed. Absent before the session's first prompt. */
export const PROMPT_ID = '7f3c2a91-5d4e-4b8a-a2c6-0e9d1b4f6a83'

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

// The prompt_cache states the scenarios send. Like resets_at, expires_at and last_miss_at are
// OFFSETS in seconds from render time (negative = in the past), resolved by resolveResets.

/** A warm 1h cache with one diagnosed miss. */
export const CACHE_WARM_ONE_MISS = {
  warm: true,
  caching_observed: true,
  ttl: '1h',
  expires_at: hm(0, 52),
  requests: 14,
  misses: 1,
  expected_rebuilds: 0,
  hit_ratio: 0.86,
  cache_write_tokens: 61_000,
  miss_recache_tokens: 18_500,
  last_miss_at: -hm(0, 38),
  last_miss_cause: { causes: ['tools_changed'], tools_added: 2, tools_removed: 0 },
  miss_causes: { tools_changed: 1 },
  recache_tokens_if_cold: 44_000,
}

/** prompt_cache fields for a session with no cache misses yet. */
const NO_CACHE_MISSES = {
  misses: 0,
  miss_recache_tokens: 0,
  last_miss_at: null,
  last_miss_cause: null,
  miss_causes: {},
}

/** A warm 5m cache with no misses yet. */
export const CACHE_WARM_5M_NO_MISSES = {
  ...CACHE_WARM_ONE_MISS,
  ...NO_CACHE_MISSES,
  ttl: '5m',
  expires_at: hm(0, 4),
  requests: 31,
  hit_ratio: 0.95,
  cache_write_tokens: 118_000,
  recache_tokens_if_cold: 96_000,
}

/** Gone cold: the 5m TTL ran out 3 minutes ago, after several misses. */
export const CACHE_COLD_TTL_EXPIRED = {
  ...CACHE_WARM_ONE_MISS,
  warm: false,
  ttl: '5m',
  expires_at: -hm(0, 3),
  requests: 58,
  misses: 4,
  expected_rebuilds: 2,
  hit_ratio: 0.78,
  cache_write_tokens: 640_000,
  miss_recache_tokens: 410_000,
  last_miss_at: -hm(0, 9),
  last_miss_cause: { causes: ['ttl_expired_5m'] },
  miss_causes: { ttl_expired_5m: 3, system_prompt_changed: 1 },
  recache_tokens_if_cold: 182_000,
}

/** A warm 1h cache over a 1M context, missed once by a system prompt change. */
export const CACHE_WARM_1M_CONTEXT = {
  ...CACHE_WARM_ONE_MISS,
  expires_at: hm(0, 57),
  requests: 96,
  expected_rebuilds: 1,
  hit_ratio: 0.97,
  cache_write_tokens: 1_150_000,
  miss_recache_tokens: 212_000,
  last_miss_at: -hm(1, 40),
  last_miss_cause: { causes: ['system_prompt_changed'], system_char_delta: 412 },
  miss_causes: { system_prompt_changed: 1 },
  recache_tokens_if_cold: 640_000,
}

/** Just after /compact: the rewritten conversation has nothing cached yet. */
export const CACHE_REBUILDING_AFTER_COMPACT = {
  ...CACHE_WARM_ONE_MISS,
  ...NO_CACHE_MISSES,
  warm: false,
  ttl: '5m',
  expires_at: null,
  requests: 22,
  expected_rebuilds: 1,
  hit_ratio: 0.88,
  cache_write_tokens: 84_000,
  recache_tokens_if_cold: null,
}

/** A warm 1h cache whose last miss was likely server-side. */
export const CACHE_WARM_SERVER_SIDE_MISS = {
  ...CACHE_WARM_ONE_MISS,
  expires_at: hm(0, 44),
  requests: 19,
  misses: 2,
  hit_ratio: 0.89,
  cache_write_tokens: 102_000,
  miss_recache_tokens: 41_000,
  last_miss_at: -hm(0, 21),
  last_miss_cause: { causes: ['likely_server_side'] },
  miss_causes: { likely_server_side: 1, tools_changed: 1 },
  recache_tokens_if_cold: 74_000,
}

/** A warm 1h cache with no misses yet. */
export const CACHE_WARM_1H_NO_MISSES = {
  ...CACHE_WARM_ONE_MISS,
  ...NO_CACHE_MISSES,
  expires_at: hm(0, 31),
  requests: 9,
  hit_ratio: 0.9,
  cache_write_tokens: 52_000,
}

type Window = { used_percentage: number; resets_at: number }
type CacheTimes = { expires_at: number | null; last_miss_at: number | null }
/** Convert each timestamp offset a scenario carries (every rate-limit window's resets_at, and
 * prompt_cache's expires_at and last_miss_at) into an absolute epoch (nowSec + offset); null stays
 * null. Returns a new stdin object; the shared scenario data is never mutated. */
export function resolveResets(
  stdin: Record<string, unknown>,
  nowSec: number,
): Record<string, unknown> {
  const at = (offset: number | null) => (offset === null ? null : nowSec + offset)
  const next = { ...stdin }
  const rl = stdin.rate_limits as Record<string, Window> | undefined
  if (rl) {
    next.rate_limits = Object.fromEntries(
      Object.entries(rl).map(([name, w]) => [name, { ...w, resets_at: nowSec + w.resets_at }]),
    )
  }
  const cache = stdin.prompt_cache as CacheTimes | undefined
  if (cache) {
    next.prompt_cache = {
      ...cache,
      expires_at: at(cache.expires_at),
      last_miss_at: at(cache.last_miss_at),
    }
  }
  return next
}
