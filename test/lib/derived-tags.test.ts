import { describe, expect, it } from 'vitest'
import { computeAllTags, deriveCapabilityTags, mergeTags } from '@/lib/derived-tags'

describe('deriveCapabilityTags', () => {
  it('maps interpreter to its slug', () => {
    expect(
      deriveCapabilityTags({ interpreter: 'node', networkHosts: [], readsClaudeToken: false }),
    ).toEqual(['node'])
  })
  it('adds network-access when hosts are declared', () => {
    expect(
      deriveCapabilityTags({
        interpreter: 'bash',
        networkHosts: ['api.github.com'],
        readsClaudeToken: false,
      }),
    ).toContain('network-access')
  })
  it('adds reads-token when the flag is set', () => {
    expect(
      deriveCapabilityTags({ interpreter: 'bash', networkHosts: [], readsClaudeToken: true }),
    ).toContain('reads-token')
  })
  it('coerces an unknown interpreter to bash', () => {
    expect(
      deriveCapabilityTags({ interpreter: 'ruby', networkHosts: [], readsClaudeToken: false }),
    ).toEqual(['bash'])
  })
})

describe('mergeTags', () => {
  it('unions and de-duplicates', () => {
    expect(mergeTags(['quota', 'node'], ['node', 'network-access']).sort()).toEqual(
      ['network-access', 'node', 'quota'].sort(),
    )
  })
})

describe('computeAllTags', () => {
  it('merges curated tags with derived capability tags', () => {
    const result = computeAllTags({
      curatedTags: ['quota'],
      interpreter: 'python',
      networkHosts: ['x.test'],
      readsClaudeToken: true,
    })
    expect(new Set(result)).toEqual(new Set(['quota', 'python', 'network-access', 'reads-token']))
  })
})
