import { describe, expect, it } from 'vitest'
import { FACET_BY_SLUG } from '@/gallery/facets'
// @/gallery/queries is the single import surface for gallery queries (its own comment says so);
// resolveLiveFacet and liveFacetLinks get re-exported there like the rest.
import { liveFacetLinks, resolveLiveFacet } from '@/gallery/queries'

const stats = new Map([
  ['git', { count: 3, latest: new Date(2026, 5, 2) }],
  ['cost', { count: 2, latest: new Date(2026, 5, 1) }],
  ['python', { count: 1, latest: new Date(2026, 5, 1) }],
  ['reads-token', { count: 5, latest: new Date(2026, 5, 1) }],
])

describe('resolveLiveFacet', () => {
  it('returns the facet with just 1 match (no floor)', () => {
    expect(resolveLiveFacet('git', stats)).toBe(FACET_BY_SLUG.get('git'))
    expect(resolveLiveFacet('cost', stats)).toBe(FACET_BY_SLUG.get('cost'))
    expect(resolveLiveFacet('python', stats)).toBe(FACET_BY_SLUG.get('python'))
  })
  it('returns null for a page facet with zero matches (page must 404, not render thin)', () => {
    expect(resolveLiveFacet('python', new Map([['python', { count: 0, latest: null }]]))).toBeNull()
  })
  it('returns null for a page:false capability tag even with matches', () => {
    expect(resolveLiveFacet('reads-token', stats)).toBeNull()
  })
  it('returns null for unknown slugs', () => {
    expect(resolveLiveFacet('nope', stats)).toBeNull()
  })
})

describe('liveFacetLinks', () => {
  it('lists page facets with 3 matches but omits facets with 1 or 2', () => {
    expect(liveFacetLinks(stats)).toEqual([{ slug: 'git', chipLabel: 'git' }])
  })
  it('excludes page:false capability tags even with matches', () => {
    expect(liveFacetLinks(stats).map((f) => f.slug)).not.toContain('reads-token')
  })
  it('can exclude the current facet', () => {
    expect(liveFacetLinks(stats, 'git')).toEqual([])
  })
})
