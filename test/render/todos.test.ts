import { describe, expect, it } from 'vitest'
import { SCENARIO_BY_KEY, SCENARIOS } from '@/render/scenarios'
import { buildTodosFile } from '@/render/todos'
import type { Scenario } from '@/render/types'

function scenario(key: string): Scenario {
  const s = SCENARIO_BY_KEY.get(key)
  if (!s) throw new Error(`no scenario ${key}`)
  return s
}

type Todo = { content: string; status: string; activeForm: string }

describe('buildTodosFile', () => {
  it('names the file the way Claude Code does, so script filename filters match', () => {
    const s = scenario('dirty-feature')
    const sessionId = (s.stdin as { session_id: string }).session_id
    const file = buildTodosFile(s)
    expect(file).not.toBeNull()
    expect(file?.path).toBe(`/home/user/.claude/todos/${sessionId}-agent-${sessionId}.json`)
    // The exact filter community scripts use:
    const basename = file?.path.split('/').at(-1) ?? ''
    expect(basename.startsWith(sessionId)).toBe(true)
    expect(basename.includes('-agent-')).toBe(true)
    expect(basename.endsWith('.json')).toBe(true)
  })

  it('returns null for fresh-session only — a brand-new session has no todo file yet', () => {
    expect(buildTodosFile(scenario('fresh-session'))).toBeNull()
  })

  it('returns a todos file for post-compact (zero context tokens, but mid-session)', () => {
    expect(buildTodosFile(scenario('post-compact'))).not.toBeNull()
  })

  it('every non-null list is valid JSON with exactly one in_progress entry carrying activeForm', () => {
    for (const s of SCENARIOS) {
      const file = buildTodosFile(s)
      if (file === null) continue
      const todos = JSON.parse(file.content) as Todo[]
      expect(Array.isArray(todos)).toBe(true)
      expect(todos.length).toBeGreaterThan(0)
      const inProgress = todos.filter((t) => t.status === 'in_progress')
      expect(inProgress).toHaveLength(1)
      expect((inProgress[0]?.activeForm ?? '').length).toBeGreaterThan(0)
      for (const t of todos) {
        expect(['pending', 'in_progress', 'completed']).toContain(t.status)
        expect(t.content.length).toBeGreaterThan(0)
      }
    }
  })

  it('falls back to the default list for an unknown scenario key', () => {
    const s = { ...scenario('clean-main'), key: 'some-future-scenario' }
    const file = buildTodosFile(s)
    expect(file).not.toBeNull()
    expect(JSON.parse(file?.content ?? '[]').length).toBeGreaterThan(0)
  })

  it('is deterministic: two calls yield identical output', () => {
    const a = buildTodosFile(scenario('worktree'))
    const b = buildTodosFile(scenario('worktree'))
    expect(a).toEqual(b)
  })
})
