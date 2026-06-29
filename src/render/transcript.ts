import type { Scenario } from './types'

// Builds a realistic Claude Code session transcript (JSONL) for a scenario, so status lines that
// read the transcript — cost computed from token usage, session duration from timestamps — render
// truthfully in the sandbox instead of degrading to empty. Schema mirrors a real Claude Code
// transcript (verified against ~/.claude/projects/<proj>/<session>.jsonl, v2.1.x): one JSON object
// per line, chained by parentUuid, each carrying type/timestamp/sessionId/cwd/gitBranch/version and,
// for assistant turns, message.{model,usage}. See https://claude-dev.tools/docs/jsonl-format.

/** ~1 assistant turn per 2 minutes of session, clamped to a sane range. */
const MS_PER_TURN = 120_000
const MIN_TURNS = 2
const MAX_TURNS = 8
/** Fresh user input per turn (new prompt + tool results) — small; cost is dominated by cache. */
const FRESH_INPUT_PER_TURN = 1_800

interface ScenarioStdin {
  transcript_path: string
  session_id: string
  version?: string
  model: { id: string }
  workspace?: { current_dir?: string }
  cost?: { total_duration_ms?: number }
  context_window?: { total_input_tokens?: number | null }
}

interface TurnUsage {
  input_tokens: number
  output_tokens: number
  cache_creation_input_tokens: number
  cache_read_input_tokens: number
}

/** Deterministic uuid-like id from the session id + a sequence number (no randomness, so a given
 *  scenario + render time always yields byte-identical output — needed for stable tests/caching). */
function seqId(sessionId: string, seq: number): string {
  return `${sessionId.slice(0, 8)}-0000-4000-8000-${String(seq).padStart(12, '0')}`
}

function turnCount(durationMs: number): number {
  return Math.max(MIN_TURNS, Math.min(MAX_TURNS, Math.round(durationMs / MS_PER_TURN)))
}

/** Per-turn token usage. The cache grows toward the current context size (`totalInput`) over the
 *  session, so the final turn's cache_read equals the context fill shown in stdin. */
function usageForTurn(turnIndex: number, turns: number, totalInput: number): TurnUsage {
  return {
    input_tokens: FRESH_INPUT_PER_TURN,
    output_tokens: 250 + turnIndex * 60,
    cache_creation_input_tokens: Math.round(totalInput / turns),
    cache_read_input_tokens: Math.round((totalInput * (turnIndex + 1)) / turns),
  }
}

export function buildTranscript(
  scenario: Scenario,
  nowMs: number,
): { path: string; content: string } {
  const stdin = scenario.stdin as unknown as ScenarioStdin
  const sessionId = stdin.session_id
  const model = stdin.model.id
  const cwd = stdin.workspace?.current_dir ?? '/home/user/app'
  const version = stdin.version ?? '2.1.155'
  const branch = scenario.git?.branch
  const durationMs = stdin.cost?.total_duration_ms ?? 0
  const totalInput = stdin.context_window?.total_input_tokens ?? 0

  let seq = 0
  let parentUuid: string | null = null
  const lines: string[] = []

  const base = (type: string, atMs: number): Record<string, unknown> => {
    const uuid = seqId(sessionId, seq++)
    const entry: Record<string, unknown> = {
      parentUuid,
      isSidechain: false,
      type,
      uuid,
      timestamp: new Date(atMs).toISOString(),
      userType: 'external',
      entrypoint: 'cli',
      cwd,
      sessionId,
      version,
    }
    if (branch !== undefined) entry.gitBranch = branch
    parentUuid = uuid
    return entry
  }

  // Empty/just-started context (no tokens yet): a single user prompt, no assistant turn → ~0 cost.
  if (totalInput <= 0) {
    const user = base('user', nowMs)
    user.message = { role: 'user', content: 'Help me with this project.' }
    lines.push(JSON.stringify(user))
    return { path: stdin.transcript_path, content: lines.join('\n') }
  }

  const turns = turnCount(durationMs)
  const start = nowMs - durationMs
  for (let i = 0; i < turns; i++) {
    const userAt = start + (durationMs * i) / turns
    const asstAt = start + (durationMs * (i + 0.5)) / turns

    const user = base('user', userAt)
    user.message = { role: 'user', content: `Step ${i + 1}: continue the task.` }
    lines.push(JSON.stringify(user))

    const asst = base('assistant', asstAt)
    asst.requestId = `req_${seqId(sessionId, seq)}`
    asst.message = {
      id: `msg_${seqId(sessionId, seq)}`,
      type: 'message',
      role: 'assistant',
      model,
      content: [{ type: 'text', text: `Working on step ${i + 1}.` }],
      stop_reason: 'end_turn',
      stop_sequence: null,
      usage: usageForTurn(i, turns, totalInput),
    }
    lines.push(JSON.stringify(asst))
  }

  return { path: stdin.transcript_path, content: lines.join('\n') }
}
