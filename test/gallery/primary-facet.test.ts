import { describe, expect, it } from 'vitest'
import { primaryFacet } from '@/gallery/facet-queries'

const stats = (counts: Record<string, number>) =>
  new Map(Object.entries(counts).map(([slug, count]) => [slug, { count, latest: null }]))

describe('primaryFacet', () => {
  it('picks the first of the config tags that is an indexable facet page', () => {
    const facet = primaryFacet(
      ['git', 'token-usage', 'bash'],
      stats({ git: 2, 'token-usage': 3, bash: 9 }),
    )
    expect(facet).toEqual({
      slug: 'token-usage',
      heading: 'Claude Code status lines that show token usage',
    })
  })

  it('skips tags without a facet page and returns null when nothing qualifies', () => {
    expect(primaryFacet(['reads-token', 'git'], stats({ 'reads-token': 9, git: 1 }))).toBeNull()
  })
})
