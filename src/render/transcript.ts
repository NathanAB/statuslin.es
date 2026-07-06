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

/** Deterministic tool call per turn. Names/inputs mirror real Claude Code tools so
 *  transcript-reading status lines (running/completed tool activity) render faithfully.
 *  TodoWrite/TaskCreate/TaskUpdate are deliberately absent: activity parsers ignore them. */
const TOOL_CYCLE: { name: string; input: (cwd: string) => Record<string, unknown> }[] = [
  { name: 'Read', input: (cwd) => ({ file_path: `${cwd}/src/index.ts` }) },
  { name: 'Bash', input: () => ({ command: 'bun test', description: 'Run the test suite' }) },
  { name: 'Edit', input: (cwd) => ({ file_path: `${cwd}/src/app.ts` }) },
  { name: 'Grep', input: () => ({ pattern: 'TODO', output_mode: 'files_with_matches' }) },
]

/** Stable tool_use ids in a namespace (9000+) that can never collide with entry uuids. */
function toolId(sessionId: string, n: number): string {
  return `toolu_${seqId(sessionId, 9000 + n)}`
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

  // fresh-session ONLY: a just-started session has no assistant turn yet → a single user prompt,
  // no tool activity, ~0 cost. Deliberately not keyed off zero context tokens — post-compact also
  // has zero tokens but models a mid-session state whose transcript (and tool activity) persists;
  // /compact does not delete the transcript file.
  if (scenario.key === 'fresh-session') {
    const user = base('user', nowMs)
    user.message = { role: 'user', content: 'Help me with this project.' }
    lines.push(JSON.stringify(user))
    return { path: stdin.transcript_path, content: lines.join('\n') }
  }

  const turns = turnCount(durationMs)
  const start = nowMs - durationMs
  let pendingToolId: string | null = null
  for (let i = 0; i < turns; i++) {
    const userAt = start + (durationMs * i) / turns
    const asstAt = start + (durationMs * (i + 0.5)) / turns

    // The previous turn's tool result arrives as its own user entry, like real transcripts.
    // The final turn's tool never resolves, so "running tool" states render.
    if (pendingToolId !== null) {
      const res = base('user', userAt)
      res.message = {
        role: 'user',
        content: [
          { type: 'tool_result', tool_use_id: pendingToolId, is_error: false, content: 'ok' },
        ],
      }
      lines.push(JSON.stringify(res))
    }

    const user = base('user', userAt)
    user.message = { role: 'user', content: `Step ${i + 1}: continue the task.` }
    lines.push(JSON.stringify(user))

    const tool = TOOL_CYCLE[i % TOOL_CYCLE.length] as (typeof TOOL_CYCLE)[number]
    const useId = toolId(sessionId, i)
    const content: Record<string, unknown>[] = [
      { type: 'text', text: `Working on step ${i + 1}.` },
      { type: 'tool_use', id: useId, name: tool.name, input: tool.input(cwd) },
    ]
    // One running subagent on the final turn. Named `Agent` (the current Claude Code subagent
    // tool); activity parsers key on exactly that name for their agents line.
    if (i === turns - 1) {
      content.push({
        type: 'tool_use',
        id: toolId(sessionId, 9_00),
        name: 'Agent',
        input: {
          description: 'Review the change for regressions',
          prompt: 'Review the working-tree diff for regressions and report findings.',
          subagent_type: 'code-reviewer',
        },
      })
    }

    const asst = base('assistant', asstAt)
    asst.requestId = `req_${seqId(sessionId, seq)}`
    asst.message = {
      id: `msg_${seqId(sessionId, seq)}`,
      type: 'message',
      role: 'assistant',
      model,
      content,
      stop_reason: 'end_turn',
      stop_sequence: null,
      usage: usageForTurn(i, turns, totalInput),
    }
    lines.push(JSON.stringify(asst))
    pendingToolId = useId
  }

  // The running agent's sidechain opener (real subagent turns carry isSidechain: true).
  // Parsers that ignore sidechains skip it; it exists for shape fidelity.
  const side = base('user', nowMs)
  side.isSidechain = true
  side.message = {
    role: 'user',
    content: 'Review the working-tree diff for regressions and report findings.',
  }
  lines.push(JSON.stringify(side))

  return { path: stdin.transcript_path, content: lines.join('\n') }
}
