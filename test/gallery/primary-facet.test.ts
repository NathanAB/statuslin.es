import { describe, expect, it } from 'vitest'
import { primaryFacetLink } from '@/gallery/facet-page-copy'
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

// A status line page's breadcrumb names its topic as the topic page names itself, so a topic that
// lists a mod reads the same in both places.
describe('primaryFacetLink', () => {
  const facet = { slug: 'token-usage', heading: 'Claude Code status lines that show token usage' }

  it('names a topic that lists a mod by the heading its page uses then', () => {
    expect(primaryFacetLink(facet, [['token-usage', 'multi-line'], ['pets']])).toEqual({
      slug: 'token-usage',
      heading: 'Claude Code status lines and mods that show token usage',
    })
  })

  it('keeps the status line heading while no mod carries the topic, and passes null through', () => {
    expect(primaryFacetLink(facet, [['pets']])).toEqual(facet)
    expect(primaryFacetLink(null, [['token-usage']])).toBeNull()
  })
})
