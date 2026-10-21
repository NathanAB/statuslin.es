import { describe, expect, it } from 'vitest'
import { FACET_INTRO, FACET_KIND_NOTE, FACET_MOD_COPY } from '@/gallery/facet-copy'
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
    // From production on 2026-10-21: filetree carries git, deck and token-weather-usage carry
    // burn-rate, deck carries weather, and the rest as on 2026-10-15. A facet gains mod copy only
    // once a mod is tagged for it.
    expect(Object.keys(FACET_MOD_COPY)).toEqual([
      'git',
      'token-usage',
      'cost',
      'quota',
      'burn-rate',
      'weather',
      'minimal',
      'multi-line',
    ])
    for (const copy of Object.values(FACET_MOD_COPY)) {
      expect(brandedPageTitle(copy.titleBase)).toMatch(/ \| statuslin\.es$/)
      expect(copy.titleBase).toMatch(/ Mods$/)
      expect(copy.heading).toMatch(/ mods( |$)/)
      expect(copy.metaDescription.length).toBeLessThanOrEqual(160)
    }
  })
  // Search Console, 2026-07-21 to 2026-10-20: 89% of token-usage's and 83% of quota's query
  // impressions say "status line". Those two keep the words beside "mods"; the rest say "mods".
  it('keeps "status lines" in the copy of the topics people search for as status lines', () => {
    const keeps = ['token-usage', 'quota']
    for (const [slug, copy] of Object.entries(FACET_MOD_COPY)) {
      const words = `${copy.titleBase} ${copy.heading} ${copy.metaDescription}`
      if (keeps.includes(slug)) {
        expect(copy.titleBase).toMatch(/Status Lines & Mods$/)
        expect(copy.heading).toMatch(/status lines and mods/)
        expect(copy.metaDescription).toMatch(/status lines? (and|or) mods?/i)
      } else {
        expect(words).not.toMatch(/status lines? (and|&|or) mods?/i)
      }
    }
  })
  // A topic that lists mods asks the reader to pick from both kinds, not only status lines.
  it('words the intros of topics that list mods for both kinds', () => {
    for (const slug of ['quota', 'burn-rate', 'weather']) {
      expect(FACET_INTRO[slug as keyof typeof FACET_INTRO].join(' ')).not.toMatch(
        /Pick a status line|These status lines/,
      )
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
