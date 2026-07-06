import { describe, expect, it } from 'vitest'
import { SCENARIO_BY_KEY } from '@/render/scenarios'
import { buildTranscript } from '@/render/transcript'
import type { Scenario } from '@/render/types'

const NOW = 1_790_000_000_000 // fixed render time (ms) for deterministic timestamps

function scenario(key: string): Scenario {
  const s = SCENARIO_BY_KEY.get(key)
  if (!s) throw new Error(`no scenario ${key}`)
  return s
}

type ContentBlock = {
  type: string
  id?: string
  name?: string
  input?: Record<string, unknown>
  tool_use_id?: string
  text?: string
}

type Entry = {
  type: string
  timestamp: string
  sessionId?: string
  gitBranch?: string
  isSidechain?: boolean
  message?: {
    role?: string
    model?: string
    usage?: Record<string, number>
    content?: string | ContentBlock[]
  }
}

function parse(content: string): Entry[] {
  return content
    .split('\n')
    .filter((l) => l.trim().length > 0)
    .map((l) => JSON.parse(l) as Entry)
}

const sumUsage = (entries: Entry[], field: string): number =>
  entries
    .filter((e) => e.type === 'assistant')
    .reduce((acc, e) => acc + (e.message?.usage?.[field] ?? 0), 0)

const blocks = (e: Entry): ContentBlock[] =>
  Array.isArray(e.message?.content) ? e.message.content : []

const toolUses = (entries: Entry[]): ContentBlock[] =>
  entries
    .filter((e) => e.type === 'assistant')
    .flatMap((e) => blocks(e).filter((b) => b.type === 'tool_use'))

const toolResults = (entries: Entry[]): ContentBlock[] =>
  entries
    .filter((e) => e.type === 'user')
    .flatMap((e) => blocks(e).filter((b) => b.type === 'tool_result'))

describe('buildTranscript', () => {
  it('writes to the scenario transcript_path', () => {
    const s = scenario('near-full')
    const { path } = buildTranscript(s, NOW)
    expect(path).toBe((s.stdin as { transcript_path: string }).transcript_path)
  })

  it('emits valid JSONL (every line parses) with at least one assistant turn for a used context', () => {
    const entries = parse(buildTranscript(scenario('near-full'), NOW).content)
    expect(entries.length).toBeGreaterThan(0)
    expect(entries.some((e) => e.type === 'assistant')).toBe(true)
    expect(entries.some((e) => e.type === 'user')).toBe(true)
  })

  it('stamps every assistant turn with the scenario model id', () => {
    const s = scenario('dirty-feature')
    const model = (s.stdin as { model: { id: string } }).model.id
    const entries = parse(buildTranscript(s, NOW).content)
    for (const e of entries.filter((x) => x.type === 'assistant')) {
      expect(e.message?.model).toBe(model)
    }
  })

  it('carries the scenario sessionId and gitBranch on entries', () => {
    const s = scenario('dirty-feature')
    const entries = parse(buildTranscript(s, NOW).content)
    const sessionId = (s.stdin as { session_id: string }).session_id
    expect(entries[0]?.sessionId).toBe(sessionId)
    expect(entries[0]?.gitBranch).toBe('feat/auth')
  })

  it('omits gitBranch for a non-git scenario', () => {
    const entries = parse(buildTranscript(scenario('non-git'), NOW).content)
    expect(entries.every((e) => e.gitBranch === undefined)).toBe(true)
  })

  it('accumulates token usage proportional to the scenario context fill', () => {
    const near = parse(buildTranscript(scenario('near-full'), NOW).content) // 91%
    const dirty = parse(buildTranscript(scenario('dirty-feature'), NOW).content) // 48%
    expect(sumUsage(near, 'output_tokens')).toBeGreaterThan(0)
    // Heavier context → larger cumulative cache usage (drives cost).
    expect(sumUsage(near, 'cache_read_input_tokens')).toBeGreaterThan(
      sumUsage(dirty, 'cache_read_input_tokens'),
    )
  })

  it("reflects the current context in the final turn's cache_read", () => {
    const s = scenario('near-full')
    const total = (s.stdin as { context_window: { total_input_tokens: number } }).context_window
      .total_input_tokens
    const assistants = parse(buildTranscript(s, NOW).content).filter((e) => e.type === 'assistant')
    const last = assistants.at(-1)
    expect(last?.message?.usage?.cache_read_input_tokens).toBe(total)
  })

  it('produces ~empty usage for a just-started (emptyUsage) scenario', () => {
    const entries = parse(buildTranscript(scenario('fresh-session'), NOW).content)
    expect(sumUsage(entries, 'output_tokens')).toBe(0)
  })

  it('orders timestamps ascending and ends at or before now', () => {
    const entries = parse(buildTranscript(scenario('near-full'), NOW).content)
    const ts = entries.map((e) => Date.parse(e.timestamp))
    for (let i = 1; i < ts.length; i++) expect(ts[i]).toBeGreaterThanOrEqual(ts[i - 1] as number)
    expect(ts.at(-1)).toBeLessThanOrEqual(NOW)
  })

  it('is deterministic: same scenario + now → identical content', () => {
    const a = buildTranscript(scenario('worktree'), NOW).content
    const b = buildTranscript(scenario('worktree'), NOW).content
    expect(a).toBe(b)
  })

  it('adds a tool_use to every assistant turn, with realistic names and inputs', () => {
    const entries = parse(buildTranscript(scenario('near-full'), NOW).content)
    const uses = toolUses(entries).filter((b) => b.name !== 'Agent')
    const assistants = entries.filter((e) => e.type === 'assistant')
    expect(uses.length).toBe(assistants.length)
    for (const u of uses) {
      expect(u.id).toBeTruthy()
      expect(['Read', 'Bash', 'Edit', 'Grep']).toContain(u.name)
    }
  })

  it('resolves every tool_use except the final turn (running-tool state)', () => {
    const entries = parse(buildTranscript(scenario('near-full'), NOW).content)
    const useIds = toolUses(entries).map((b) => b.id)
    const resultIds = new Set(toolResults(entries).map((b) => b.tool_use_id))
    const unresolved = useIds.filter((id) => !resultIds.has(id))
    // exactly two unresolved: the final turn's tool and the running Agent
    expect(unresolved).toHaveLength(2)
  })

  it('includes exactly one running Agent tool_use with description and subagent_type', () => {
    const entries = parse(buildTranscript(scenario('near-full'), NOW).content)
    const agents = toolUses(entries).filter((b) => b.name === 'Agent')
    expect(agents).toHaveLength(1)
    expect(typeof agents[0]?.input?.description).toBe('string')
    expect(typeof agents[0]?.input?.subagent_type).toBe('string')
    const resultIds = new Set(toolResults(entries).map((b) => b.tool_use_id))
    expect(resultIds.has(agents[0]?.id ?? '')).toBe(false)
  })

  it('includes at least one isSidechain entry for the agent', () => {
    const entries = parse(buildTranscript(scenario('near-full'), NOW).content)
    expect(entries.some((e) => e.isSidechain === true)).toBe(true)
  })

  it('keeps the empty-context branch tool-free', () => {
    const entries = parse(buildTranscript(scenario('fresh-session'), NOW).content)
    expect(toolUses(entries)).toHaveLength(0)
    expect(entries.some((e) => e.isSidechain === true)).toBe(false)
  })

  it('pins usage byte-identical to the pre-enrichment builder (near-full regression)', () => {
    // near-full: duration 612000ms → 5 turns; totalInput = 182_000 (91% of 200k).
    // These arrays are the exact output of the pre-enrichment formula — do not "fix" them.
    const entries = parse(buildTranscript(scenario('near-full'), NOW).content)
    const usages = entries.filter((e) => e.type === 'assistant').map((e) => e.message?.usage)
    expect(usages).toEqual([
      {
        input_tokens: 1800,
        output_tokens: 250,
        cache_creation_input_tokens: 36400,
        cache_read_input_tokens: 36400,
      },
      {
        input_tokens: 1800,
        output_tokens: 310,
        cache_creation_input_tokens: 36400,
        cache_read_input_tokens: 72800,
      },
      {
        input_tokens: 1800,
        output_tokens: 370,
        cache_creation_input_tokens: 36400,
        cache_read_input_tokens: 109200,
      },
      {
        input_tokens: 1800,
        output_tokens: 430,
        cache_creation_input_tokens: 36400,
        cache_read_input_tokens: 145600,
      },
      {
        input_tokens: 1800,
        output_tokens: 490,
        cache_creation_input_tokens: 36400,
        cache_read_input_tokens: 182000,
      },
    ])
  })
})
