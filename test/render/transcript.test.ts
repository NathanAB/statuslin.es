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

type Entry = {
  type: string
  timestamp: string
  sessionId?: string
  gitBranch?: string
  message?: { role?: string; model?: string; usage?: Record<string, number> }
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
})
