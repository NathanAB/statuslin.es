import { describe, expect, it } from 'vitest'
import { FACET_KIND_NOTE, FACET_MOD_COPY } from '@/gallery/facet-copy'
import { FACETS, TAG_VOCABULARY, tagHref } from '@/gallery/facets'
import { brandedPageTitle } from '@/lib/page-title'
import { JOB_BY_TAG } from '@/mods/mod-header'

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
      expect(copy.titleBase).toMatch(/ Mods$/)
      expect(copy.heading).toMatch(/ mods( |$)/)
      expect(`${copy.titleBase} ${copy.heading} ${copy.metaDescription}`).not.toMatch(
        /status lines? (and|&) mods/i,
      )
      expect(copy.metaDescription.length).toBeLessThanOrEqual(160)
    }
  })
  it('claims nothing about where mods draw, which varies by mod and is shown on each mod page', () => {
    // Surfaces and Desktop support come from each mod's recorded facts, never from shared copy.
    const surfaceClaims = /above the prompt|in a pane|claude desktop shows/i
    for (const copy of Object.values(FACET_MOD_COPY)) {
      expect(copy.metaDescription).not.toMatch(surfaceClaims)
    }
    expect(FACET_KIND_NOTE).not.toMatch(surfaceClaims)
  })
  it('keys mod copy only by real tags, so a typo fails here instead of dropping the copy', () => {
    for (const slug of Object.keys(FACET_MOD_COPY)) expect(TAG_VOCABULARY).toContain(slug)
    for (const tag of Object.keys(JOB_BY_TAG)) expect(TAG_VOCABULARY).toContain(tag)
  })
  it('tagHref points page tags to their page and non-page tags to the filtered home', () => {
    expect(tagHref('git')).toEqual({ to: '/status-lines/$facet', params: { facet: 'git' } })
    expect(tagHref('reads-token')).toEqual({ to: '/', search: { tags: 'reads-token' } })
  })
})
