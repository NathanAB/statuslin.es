import { describe, expect, it } from 'vitest'
import { FACET_INTRO } from '@/gallery/facet-copy'
import { FACET_BY_SLUG, FACETS, TAG_VOCABULARY, tagHref } from '@/gallery/facets'
import { brandedPageTitle } from '@/lib/page-title'
import { JOB_BY_TAG } from '@/mods/mod-header'

/** The topics someone decided list mods, each with its fixed title. */
const TITLES_WITH_MODS = {
  git: 'Claude Code Git Branch Status Lines & Mods',
  'token-usage': 'Claude Code Token Usage Status Lines & Mods',
  cost: 'Claude Code Session Cost: Status Lines & Mods',
  quota: 'Claude Code Usage Limit Status Lines & Mods',
  'burn-rate': 'Claude Code Burn Rate Status Lines & Mods',
  weather: 'Claude Code Weather Status Lines & Mods',
  minimal: 'Minimal Claude Code Status Lines & Mods',
  'multi-line': 'Multi-Line Claude Code Status Lines & Mods',
}
const pageFacets = FACETS.filter((f) => f.page)

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
  // Titles are fixed: a topic someone decided lists mods names both kinds, status lines first.
  it('names status lines and mods in the copy of the topics that list mods', () => {
    for (const [slug, title] of Object.entries(TITLES_WITH_MODS)) {
      const facet = FACET_BY_SLUG.get(slug)
      expect(facet?.titleBase).toBe(title)
      expect(brandedPageTitle(title)).toMatch(/ \| statuslin\.es$/)
      expect(facet?.heading).toMatch(/status lines and mods/)
      expect(facet?.metaDescription).toMatch(/status lines? (and|or) mods?/i)
      expect(facet?.metaDescription?.length).toBeLessThanOrEqual(160)
    }
  })
  it('keeps status line copy on the topics that list no mods', () => {
    for (const facet of pageFacets.filter((f) => !(f.slug in TITLES_WITH_MODS))) {
      expect(`${facet.titleBase} ${facet.heading} ${facet.metaDescription}`).not.toMatch(
        /\bmods?\b/i,
      )
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
    for (const facet of pageFacets) expect(facet.metaDescription).not.toMatch(surfaceClaims)
  })
  it('keys mod jobs only by real tags, so a typo fails here instead of dropping the job', () => {
    for (const tag of Object.keys(JOB_BY_TAG)) expect(TAG_VOCABULARY).toContain(tag)
  })
  it('tagHref points page tags to their page and non-page tags to the filtered home', () => {
    expect(tagHref('git')).toEqual({ to: '/status-lines/$facet', params: { facet: 'git' } })
    expect(tagHref('reads-token')).toEqual({ to: '/', search: { tags: 'reads-token' } })
  })
})
