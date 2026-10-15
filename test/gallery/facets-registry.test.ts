import { describe, expect, it } from 'vitest'
import { FACET_MOD_COPY } from '@/gallery/facet-copy'
import { ALL_TAG_SLUGS, FACETS, TAG_VOCABULARY, tagHref } from '@/gallery/facets'
import { brandedPageTitle } from '@/lib/page-title'

describe('tag registry', () => {
  it('includes the capability tags as badge+filter-only (page: false)', () => {
    for (const slug of ['network-access', 'reads-token']) {
      const f = FACETS.find((x) => x.slug === slug)
      expect(f?.group).toBe('capability')
      expect(f?.page).toBe(false)
    }
  })
  it('exposes weather and markets as browsable feature facets with pages', () => {
    for (const slug of ['weather', 'markets']) {
      const f = FACETS.find((x) => x.slug === slug)
      expect(f?.group).toBe('feature')
      expect(f?.page).toBe(true)
      expect(TAG_VOCABULARY).toContain(slug)
    }
  })
  it('every page:true facet has SEO copy', () => {
    for (const f of FACETS.filter((x) => x.page)) {
      expect(f.titleBase).toBeTruthy()
      expect(f.metaDescription).toBeTruthy()
      expect(f.intro?.length).toBeGreaterThan(0)
    }
  })
  it('gives mod copy only to the facets published mods carry, sized for search results', () => {
    // From production on 2026-10-15: burn-meter, context-bar, pixel-cat and token-weather carry
    // these tags. A facet gains mod copy only once a mod is tagged for it.
    expect(Object.keys(FACET_MOD_COPY)).toEqual([
      'token-usage',
      'cost',
      'quota',
      'minimal',
      'multi-line',
    ])
    for (const copy of Object.values(FACET_MOD_COPY)) {
      expect(brandedPageTitle(copy.titleBase)).toMatch(/ \| statuslin\.es$/)
      expect(copy.titleBase).toContain('Status Lines & Mods')
      expect(copy.heading).toContain('status lines and mods')
      expect(copy.metaDescription.length).toBeLessThanOrEqual(160)
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
