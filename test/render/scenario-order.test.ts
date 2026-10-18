import { describe, expect, it } from 'vitest'
import { orderByScenario } from '@/render/scenarios'

describe('orderByScenario', () => {
  it('sorts items by the canonical SCENARIOS order regardless of input order', () => {
    const shuffled = [
      { scenarioKey: 'non-git' },
      { scenarioKey: 'clean-main' },
      { scenarioKey: 'dirty-feature' },
    ]
    const ordered = orderByScenario(shuffled).map((x) => x.scenarioKey)
    // clean-main is first in SCENARIOS, then dirty-feature, then non-git (last).
    expect(ordered).toEqual(['clean-main', 'dirty-feature', 'non-git'])
  })

  it('puts unknown scenario keys last and does not mutate the input', () => {
    const input = [{ scenarioKey: 'mystery' }, { scenarioKey: 'clean-main' }]
    const ordered = orderByScenario(input)
    expect(ordered.map((x) => x.scenarioKey)).toEqual(['clean-main', 'mystery'])
    expect(input[0]?.scenarioKey).toBe('mystery') // original array untouched
  })
})
