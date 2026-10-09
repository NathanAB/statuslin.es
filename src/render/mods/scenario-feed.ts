// biome-ignore-all lint/style/useNamingConvention: keys mirror Claude Code's status line JSON.
import { z } from 'zod'
import { SCENARIO_BY_KEY } from '../scenarios'
import type { Scenario } from '../types'

/** Every mod renders against this one scenario. */
const FEED_SCENARIO_KEY = 'clean-main'

const CANNED_REPLY_TEXT = 'The repo is clean and the tests pass.'

const windowSchema = z.object({ used_percentage: z.number(), resets_at: z.number() })

const feedStdinSchema = z.object({
  session_id: z.string(),
  version: z.string(),
  model: z.object({ id: z.string(), display_name: z.string() }),
  workspace: z.object({
    current_dir: z.string(),
    project_dir: z.string(),
    repo: z.object({ host: z.string(), owner: z.string(), name: z.string() }),
  }),
  cost: z.object({ total_cost_usd: z.number(), total_duration_ms: z.number() }),
  context_window: z.object({
    context_window_size: z.number(),
    used_percentage: z.number(),
    total_input_tokens: z.number(),
    current_usage: z.object({
      input_tokens: z.number(),
      output_tokens: z.number(),
      cache_creation_input_tokens: z.number(),
      cache_read_input_tokens: z.number(),
    }),
  }),
  rate_limits: z.object({ five_hour: windowSchema, seven_day: windowSchema }),
})

export type FeedStdin = z.infer<typeof feedStdinSchema>

/** What the scenario feed plugin reads: whose `$` calls to answer, and the answers. */
export interface FeedFile {
  /** The mod under render by its plugin.json name; null for the baseline, which answers no one. */
  target: string | null
  answers: Record<string, unknown>
}

/** The `--canned-reply` file of the canned model server. */
export interface CannedReply {
  text: string
  usage: FeedStdin['context_window']['current_usage']
}

export function feedScenario(): Scenario {
  const scenario = SCENARIO_BY_KEY.get(FEED_SCENARIO_KEY)
  if (!scenario) throw new Error(`scenario ${FEED_SCENARIO_KEY} is missing`)
  return scenario
}

export function feedStdin(scenario: Scenario): FeedStdin {
  return feedStdinSchema.parse(scenario.stdin)
}

/** `resets_at` in a scenario is an offset in seconds; the mod API's `resetsAt` is ISO 8601. */
export function feedFile(scenario: Scenario, target: string | null, nowMs: number): FeedFile {
  const s = feedStdin(scenario)
  const nowSec = Math.floor(nowMs / 1000)
  const resetsAt = (offsetSec: number) => new Date((nowSec + offsetSec) * 1000).toISOString()
  const rateLimit = (kind: 'five_hour' | 'seven_day') => ({
    kind,
    percentUsed: s.rate_limits[kind].used_percentage,
    resetsAt: resetsAt(s.rate_limits[kind].resets_at),
  })
  const { repo } = s.workspace
  return {
    target,
    answers: {
      'session.usage': {
        startedAt: nowMs - s.cost.total_duration_ms,
        context: {
          tokens: s.context_window.total_input_tokens,
          window: s.context_window.context_window_size,
          percent: s.context_window.used_percentage,
        },
        rateLimits: [rateLimit('five_hour'), rateLimit('seven_day')],
        cost: { usd: s.cost.total_cost_usd },
      },
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

/** `session.measure` cannot be fed, so the engine's own context figures come from these tokens. */
export function cannedReply(scenario: Scenario): CannedReply {
  return { text: CANNED_REPLY_TEXT, usage: feedStdin(scenario).context_window.current_usage }
}
