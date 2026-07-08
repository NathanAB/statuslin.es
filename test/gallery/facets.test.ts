import { describe, expect, it } from 'vitest'
import { FACET_BY_SLUG, FACETS, TAG_VOCABULARY } from '@/gallery/facets'
import { HOME_TITLE_BASE } from '@/lib/page-title'
import { INTERPRETERS } from '@/render/types'

describe('facet registry', () => {
  it('has unique slugs and complete copy on every page facet', () => {
    expect(new Set(FACETS.map((f) => f.slug)).size).toBe(FACETS.length)
    for (const f of FACETS) {
      expect(f.slug).toMatch(/^[a-z0-9-]+$/)
      expect(f.chipLabel.length).toBeGreaterThan(0)
      if (!f.page) continue
      expect(f.titleBase?.length).toBeGreaterThan(0)
      expect(f.heading?.length).toBeGreaterThan(0)
      expect(f.metaDescription?.length).toBeGreaterThan(0)
      expect(f.intro?.length).toBeGreaterThan(0)
      for (const p of f.intro ?? []) expect(p.length).toBeGreaterThan(0)
    }
  })
  it('never reuses the home page title (cannibalization guard)', () => {
    for (const f of FACETS.filter((f) => f.page)) expect(f.titleBase).not.toBe(HOME_TITLE_BASE)
  })
  it('interpreter facets map to real interpreters; others have none', () => {
    for (const f of FACETS) {
      if (f.group === 'interpreter') expect(INTERPRETERS).toContain(f.interpreter)
      else expect(f.interpreter).toBeUndefined()
    }
  })
  it('exposes the tag vocabulary as the feature-group slugs', () => {
    expect(TAG_VOCABULARY).toEqual(FACETS.filter((f) => f.group === 'feature').map((f) => f.slug))
    expect(TAG_VOCABULARY.length).toBeGreaterThanOrEqual(8)
  })
  it('indexes every facet by slug', () => {
    expect(FACET_BY_SLUG.size).toBe(FACETS.length)
  })
})
