import { describe, expect, it } from 'vitest'
import { ALL_TAG_SLUGS, FACETS, TAG_VOCABULARY, tagHref } from '@/gallery/facets'

describe('tag registry', () => {
  it('includes the capability tags as badge+filter-only (page: false)', () => {
    for (const slug of ['network-access', 'reads-token']) {
      const f = FACETS.find((x) => x.slug === slug)
      expect(f?.group).toBe('capability')
      expect(f?.page).toBe(false)
    }
  })
  it('every page:true facet has SEO copy', () => {
    for (const f of FACETS.filter((x) => x.page)) {
      expect(f.titleBase).toBeTruthy()
      expect(f.metaDescription).toBeTruthy()
      expect(f.intro?.length).toBeGreaterThan(0)
    }
  })
  it('TAG_VOCABULARY is exactly the feature group', () => {
    expect(new Set(TAG_VOCABULARY)).toEqual(
      new Set(FACETS.filter((f) => f.group === 'feature').map((f) => f.slug)),
    )
  })
  it('ALL_TAG_SLUGS covers every facet', () => {
    expect(new Set(ALL_TAG_SLUGS)).toEqual(new Set(FACETS.map((f) => f.slug)))
  })
  it('tagHref points page tags to their page and non-page tags to the filtered home', () => {
    expect(tagHref('git')).toEqual({ to: '/status-lines/$facet', params: { facet: 'git' } })
    expect(tagHref('reads-token')).toEqual({ to: '/', search: { tags: 'reads-token' } })
  })
})
