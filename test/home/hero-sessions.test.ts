import { describe, expect, it } from 'vitest'
import { HERO_SESSION_KEYS } from '@/gallery/hero-lines'
import { HERO_SESSIONS } from '@/home/hero-sessions'
import { SCENARIO_BY_KEY } from '@/render/scenarios'

describe('HERO_SESSIONS', () => {
  it('names the four hero sessions in order, in plain words', () => {
    expect(HERO_SESSIONS.map((s) => [s.key, s.label])).toEqual([
      ['clean-main', 'Everyday'],
      ['fresh-session', 'Just started'],
      ['dirty-feature', 'Uncommitted changes'],
      ['big-context', '1M context'],
    ])
    expect(HERO_SESSIONS.map((s) => s.key)).toEqual(HERO_SESSION_KEYS)
  })

  // The caption describes the data the status line renders, so it must match the scenario.
  it.each(HERO_SESSIONS.map((s) => [s.key, s] as const))(
    "captions %s with its scenario's model and context use",
    (key, session) => {
      const scenario = SCENARIO_BY_KEY.get(key)
      const stdin = scenario?.stdin as {
        model: { display_name: string }
        context_window: { used_percentage: number | null }
      }
      expect(session.caption.startsWith(`${stdin.model.display_name} · `)).toBe(true)
      const used = stdin.context_window.used_percentage
      if (used === null) expect(session.caption).toMatch(/nothing reported yet/)
      else expect(session.caption).toMatch(new RegExp(`\\b${used}% `))
    },
  )

  it("names the dirty session's branch as the scenario has it", () => {
    const dirty = HERO_SESSIONS.find((s) => s.key === 'dirty-feature')
    expect(dirty?.caption).toContain(SCENARIO_BY_KEY.get('dirty-feature')?.git?.branch ?? '?')
  })

  it('gives every session a conversation, each opening with the welcome or a prompt', () => {
    for (const session of HERO_SESSIONS) {
      expect(session.transcript.length).toBeGreaterThan(0)
      expect(['prompt', 'note']).toContain(session.transcript[0]?.kind)
    }
  })
})
