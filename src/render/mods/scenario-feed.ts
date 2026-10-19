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

/** One tool call of the busy session, as the feed passes it to `$.tool.call`. */
export type BusyCall =
  | { tool: 'Bash'; command: string; description: string }
  | { tool: 'Read'; file_path: string }
  | { tool: 'Edit'; file_path: string; old_string: string; new_string: string }

/** What the scenario feed plugin reads: whose `$` calls to answer, the answers, and `/preview-busy`'s calls. */
export interface FeedFile {
  /** The mod under render by its plugin.json name; null for the baseline, which answers no one. */
  target: string | null
  answers: Record<string, unknown>
  busy: BusyCall[]
}

/** The files `/preview-busy` works on, relative to the workspace, in its seed commit. */
const BUSY_SOURCE = 'src/sum.js'
const BUG = 'return a - b'
const FIX = 'return a + b'
const TEST_COMMAND = 'npm test'

export const BUSY_WORKSPACE_FILES: readonly { path: string; data: string }[] = [
  {
    path: 'package.json',
    data: `${JSON.stringify({ name: 'app', version: '1.0.0', private: true, scripts: { test: 'sh test.sh' } }, null, 2)}\n`,
  },
  {
    path: 'test.sh',
    data: `if grep -qF '${FIX}' ${BUSY_SOURCE}; then\n  echo 'Tests: 3 passed, 3 total'\nelse\n  echo 'Tests: 1 failed, 2 passed, 3 total'\n  exit 1\nfi\n`,
  },
  { path: BUSY_SOURCE, data: `export function sum(a, b) {\n  ${BUG}\n}\n` },
  { path: 'build/sum.js', data: `export function sum(a, b) {\n  ${BUG}\n}\n` },
]

/** A test run that fails, the fix, a run that passes, then a clean-up the settings deny. */
function busyCalls(scenario: Scenario): BusyCall[] {
  const source = `${feedStdin(scenario).workspace.current_dir}/${BUSY_SOURCE}`
  const runTests: BusyCall = { tool: 'Bash', command: TEST_COMMAND, description: 'Run the tests' }
  return [
    runTests,
    { tool: 'Read', file_path: source },
    { tool: 'Edit', file_path: source, old_string: BUG, new_string: FIX },
    runTests,
    { tool: 'Bash', command: 'rm -rf build', description: 'Remove the build output' },
  ]
}

/**
 * The session's permission rules: each busy call but the last is allowed, so none waits on a
 * permission prompt, and the last is denied. A path rule's leading `//` makes it absolute.
 */
export function busyPermissions(scenario: Scenario): { allow: string[]; deny: string[] } {
  const source = `/${feedStdin(scenario).workspace.current_dir}/${BUSY_SOURCE}`
  return {
    allow: [`Bash(${TEST_COMMAND})`, `Read(${source})`, `Edit(${source})`],
    deny: ['Bash(rm -rf:*)'],
  }
}

/** The mod's own `$.model` calls get this, at no cost, instead of reaching the canned model. */
const MODEL_ANSWER = {
  isAnswered: true,
  text: 'Fixed the bug in src/sum.js, and all 3 tests pass now.',
  usage: {
    input_tokens: 0,
    output_tokens: 0,
    cache_read_input_tokens: 0,
    cache_creation_input_tokens: 0,
  },
}

/** `$.agent.list` answers two subagents at work (AgentInfo in the mod API). */
const RUNNING_AGENTS = [
  { id: 'a1f3c9e0', description: 'Run the test suite', type: 'general-purpose', status: 'running' },
  { id: 'b72d4e18', description: 'Review the sum fix', type: 'Explore', status: 'running' },
]

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
      'model.complete': MODEL_ANSWER,
      'model.fork': MODEL_ANSWER,
      'agent.list': RUNNING_AGENTS,
    },
    busy: busyCalls(scenario),
  }
}

/** `session.measure` cannot be fed, so the engine's own context figures come from these tokens. */
export function cannedReply(scenario: Scenario): CannedReply {
  return { text: CANNED_REPLY_TEXT, usage: feedStdin(scenario).context_window.current_usage }
}
