import { describe, expect, it } from 'vitest'
import { cannedReply, feedFile, feedScenario } from '@/render/mods/scenario-feed'
import { hm, usage, win } from '@/render/scenario-helpers'
import { SCENARIO_BY_KEY } from '@/render/scenarios'
import type { Scenario } from '@/render/types'

const NOW_MS = Date.UTC(2026, 9, 9, 12, 0, 0)

function withStdin(overrides: Record<string, unknown>): Scenario {
  const scenario = feedScenario()
  return { ...scenario, stdin: { ...scenario.stdin, ...overrides } }
}

describe('feedScenario', () => {
  it('is clean-main', () => {
    expect(feedScenario()).toBe(SCENARIO_BY_KEY.get('clean-main'))
  })
})

describe('feedFile', () => {
  it('answers the session calls from the scenario, for the mod under render', () => {
    const { target, answers } = feedFile(feedScenario(), 'token-weather', NOW_MS)

    expect(target).toBe('token-weather')
    expect(answers['session.usage']).toEqual({
      startedAt: NOW_MS - 612_000,
      context: { tokens: 44_000, window: 200_000, percent: 22 },
      rateLimits: [
        { kind: 'five_hour', percentUsed: 26, resetsAt: '2026-10-09T14:07:00.000Z' },
        { kind: 'seven_day', percentUsed: 7, resetsAt: '2026-10-11T13:00:00.000Z' },
      ],
      cost: { usd: 0.41 },
    })
    expect(answers['session.model']).toBe('Opus 4.8')
    expect(answers['session.cwd']).toBe('/home/user/app')
    expect(answers['session.root']).toBe('/home/user/app')
    expect(answers['session.id']).toBe('b8e1c0d2-4a6f-4e2a-9c1b-3f5d7a9e2c10')
    expect(answers['session.repo']).toEqual({
      root: '/home/user/app',
      remote: 'https://github.com/acme/app.git',
      internal: false,
      name: null,
    })
    expect(answers['session.version']).toEqual({ version: '2.1.155', base: '2.1.155' })
  })

  it('follows the scenario when it changes', () => {
    const scenario = withStdin({
      context_window: usage(48, 1_000_000),
      rate_limits: { five_hour: win(90, hm(0, 30)), seven_day: win(50, hm(1, 0)) },
      cost: { total_cost_usd: 2.5, total_duration_ms: 1_000 },
      model: { id: 'claude-sonnet-4-6', display_name: 'Sonnet 4.6' },
    })

    const { answers } = feedFile(scenario, 'context-bar', NOW_MS)

    expect(answers['session.usage']).toEqual({
      startedAt: NOW_MS - 1_000,
      context: { tokens: 480_000, window: 1_000_000, percent: 48 },
      rateLimits: [
        { kind: 'five_hour', percentUsed: 90, resetsAt: '2026-10-09T12:30:00.000Z' },
        { kind: 'seven_day', percentUsed: 50, resetsAt: '2026-10-09T13:00:00.000Z' },
      ],
      cost: { usd: 2.5 },
    })
    expect(answers['session.model']).toBe('Sonnet 4.6')
  })

  it('names no target for the baseline, so no plugin is answered', () => {
    expect(feedFile(feedScenario(), null, NOW_MS).target).toBeNull()
  })
})

describe('cannedReply', () => {
  it('reports the scenario current usage, so the engine counts the same context', () => {
    expect(cannedReply(feedScenario()).usage).toEqual({
      input_tokens: 37_000,
      output_tokens: 1_400,
      cache_creation_input_tokens: 5_000,
      cache_read_input_tokens: 2_000,
    })
  })

  it('follows the scenario when it changes', () => {
    const { usage: reply } = cannedReply(withStdin({ context_window: usage(48) }))

    expect(
      reply.input_tokens + reply.cache_creation_input_tokens + reply.cache_read_input_tokens,
    ).toBe(96_000)
  })
})
