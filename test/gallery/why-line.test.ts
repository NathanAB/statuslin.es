import { describe, expect, it } from 'vitest'
import { whyLine } from '@/gallery/why-line'

describe('whyLine', () => {
  it('names what a config shows, its shape, its language, and its network use', () => {
    expect(
      whyLine({
        tags: [
          'git',
          'token-usage',
          'cost',
          'quota',
          'multi-line',
          'bash',
          'network-access',
          'reads-token',
        ],
        interpreter: 'bash',
        networkHosts: ['api.anthropic.com'],
      }),
    ).toBe('Shows git, tokens, cost, and limits. Multi-line Bash script. Needs network access.')
  })

  it('joins two shown items without a list comma and combines style tags', () => {
    expect(
      whyLine({
        tags: ['cost', 'git', 'powerline', 'minimal', 'python'],
        interpreter: 'python',
        networkHosts: [],
      }),
    ).toBe('Shows git and cost. Minimal, powerline-style Python script.')
  })

  it('skips the shows sentence when no data tag is present', () => {
    expect(whyLine({ tags: ['node'], interpreter: 'node', networkHosts: [] })).toBe('Node script.')
  })
})
