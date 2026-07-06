import { describe, expect, it } from 'vitest'
import { FACET_BY_SLUG } from '@/gallery/facets'
// @/gallery/queries is the single import surface for gallery queries (its own comment says so);
// resolveLiveFacet and liveFacetLinks get re-exported there like the rest.
import { liveFacetLinks, resolveLiveFacet } from '@/gallery/queries'

const stats = new Map([
  ['git', { count: 3, latest: new Date(2026, 5, 2) }],
  ['cost', { count: 2, latest: new Date(2026, 5, 1) }],
  ['python', { count: 0, latest: null }],
])

describe('resolveLiveFacet', () => {
  it('returns the facet when it clears the threshold', () => {
    expect(resolveLiveFacet('git', stats)).toBe(FACET_BY_SLUG.get('git'))
  })
  it('returns null under the threshold (page must 404, not render thin)', () => {
    expect(resolveLiveFacet('cost', stats)).toBeNull()
    expect(resolveLiveFacet('python', stats)).toBeNull()
  })
  it('returns null for unknown slugs', () => {
    expect(resolveLiveFacet('nope', stats)).toBeNull()
  })
})

describe('liveFacetLinks', () => {
  it('lists only facets at or over the threshold', () => {
    expect(liveFacetLinks(stats)).toEqual([{ slug: 'git', chipLabel: 'git' }])
  })
  it('can exclude the current facet', () => {
    expect(liveFacetLinks(stats, 'git')).toEqual([])
  })
})
