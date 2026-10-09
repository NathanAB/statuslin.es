// biome-ignore-all lint/style/useNamingConvention: keys mirror Claude Code's status line JSON.
import { SCENARIO_BY_KEY } from '@/render/scenarios'

type Window = { used_percentage: number; resets_at: number }
type ClaudeStdin = {
  session_id: string
  version: string
  model: { id: string; display_name: string }
  workspace: {
    current_dir: string
    project_dir: string
    repo: { host: string; owner: string; name: string }
  }
  cost: { total_cost_usd: number; total_duration_ms: number }
  context_window: {
    context_window_size: number
    used_percentage: number
    total_input_tokens: number
  }
  rate_limits: { five_hour: Window; seven_day: Window }
}

export const FEED_SCENARIO_KEY = 'clean-main'

export function cleanMainStdin(): ClaudeStdin {
  const scenario = SCENARIO_BY_KEY.get(FEED_SCENARIO_KEY)
  if (!scenario) throw new Error(`scenario ${FEED_SCENARIO_KEY} missing`)
  return scenario.stdin as unknown as ClaudeStdin
}

/** What the scenario feed mod answers per `$` call event, from `clean-main`, at `nowMs`. */
export function feedValues(nowMs: number) {
  const s = cleanMainStdin()
  const nowSec = Math.floor(nowMs / 1000)
  const iso = (offsetSec: number) => new Date((nowSec + offsetSec) * 1000).toISOString()
  const context = {
    tokens: s.context_window.total_input_tokens,
    window: s.context_window.context_window_size,
    percent: s.context_window.used_percentage,
  }
  // The mod API's resetsAt is ISO 8601; the status line JSON's resets_at is epoch seconds
  // (here an offset that resolveResets turns into epoch at render time).
  const rateLimits = [
    {
      kind: 'five_hour',
      percentUsed: s.rate_limits.five_hour.used_percentage,
      resetsAt: iso(s.rate_limits.five_hour.resets_at),
    },
    {
      kind: 'seven_day',
      percentUsed: s.rate_limits.seven_day.used_percentage,
      resetsAt: iso(s.rate_limits.seven_day.resets_at),
    },
  ]
  const cost = { usd: s.cost.total_cost_usd }
  const { repo } = s.workspace
  return {
    answers: {
      'session.usage': { startedAt: nowMs - s.cost.total_duration_ms, context, rateLimits, cost },
      'session.model': s.model.display_name,
      'session.cwd': s.workspace.current_dir,
      'session.root': s.workspace.project_dir,
      'session.id': s.session_id,
      'session.repo': {
        root: s.workspace.project_dir,
        remote: `https://${repo.host}/${repo.owner}/${repo.name}.git`,
        internal: false,
        name: null,
      },
      'session.version': { version: s.version, base: s.version },
    },
  }
}

/** Token counts for the canned model reply, so the engine's own context figures match too. */
export function cannedUsage() {
  const s = cleanMainStdin()
  const total = s.context_window.total_input_tokens
  const cacheCreation = 5_000
  const cacheRead = 2_000
  return {
    input_tokens: total - cacheCreation - cacheRead,
    output_tokens: 1_400,
    cache_creation_input_tokens: cacheCreation,
    cache_read_input_tokens: cacheRead,
  }
}

/**
 * Unified rate-limit headers on the canned reply, so the engine's own rate-limit windows (what
 * `session.measure` pushes, which a hook cannot rewrite) match the scenario.
 */
export function cannedRateLimitHeaders(nowMs: number): Record<string, string> {
  const { five_hour, seven_day } = cleanMainStdin().rate_limits
  const nowSec = Math.floor(nowMs / 1000)
  return {
    'anthropic-ratelimit-unified-status': 'allowed',
    'anthropic-ratelimit-unified-5h-status': 'allowed',
    'anthropic-ratelimit-unified-5h-utilization': String(five_hour.used_percentage / 100),
    'anthropic-ratelimit-unified-5h-reset': String(nowSec + five_hour.resets_at),
    'anthropic-ratelimit-unified-7d-status': 'allowed',
    'anthropic-ratelimit-unified-7d-utilization': String(seven_day.used_percentage / 100),
    'anthropic-ratelimit-unified-7d-reset': String(nowSec + seven_day.resets_at),
  }
}
