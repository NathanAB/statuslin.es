import { describe, expect, it } from 'vitest'
import {
  FACET_BY_SLUG,
  FACETS,
  facetIntroLine,
  MIN_FACET_CONFIGS,
  TAG_VOCABULARY,
} from '@/gallery/facets'
import { HOME_TITLE_BASE } from '@/lib/page-title'
import { INTERPRETERS } from '@/render/types'

describe('facet registry', () => {
  it('has unique slugs and complete copy on every facet', () => {
    expect(new Set(FACETS.map((f) => f.slug)).size).toBe(FACETS.length)
    for (const f of FACETS) {
      expect(f.slug).toMatch(/^[a-z0-9-]+$/)
      expect(f.titleBase.length).toBeGreaterThan(0)
      expect(f.heading.length).toBeGreaterThan(0)
      expect(f.chipLabel.length).toBeGreaterThan(0)
      expect(f.metaDescription.length).toBeGreaterThan(0)
      expect(f.countPhrase.length).toBeGreaterThan(0)
      expect(f.intro.length).toBeGreaterThan(0)
      for (const p of f.intro) expect(p.length).toBeGreaterThan(0)
    }
  })
  it('never reuses the home page title (cannibalization guard)', () => {
    for (const f of FACETS) expect(f.titleBase).not.toBe(HOME_TITLE_BASE)
  })
  it('interpreter facets map to real interpreters; tag facets have none', () => {
    for (const f of FACETS) {
      if (f.kind === 'interpreter') expect(INTERPRETERS).toContain(f.interpreter)
      else expect(f.interpreter).toBeUndefined()
    }
  })
  it('exposes the tag vocabulary as the tag-facet slugs', () => {
    expect(TAG_VOCABULARY).toEqual(FACETS.filter((f) => f.kind === 'tag').map((f) => f.slug))
    expect(TAG_VOCABULARY.length).toBeGreaterThanOrEqual(8)
  })
  it('indexes every facet by slug', () => {
    expect(FACET_BY_SLUG.size).toBe(FACETS.length)
    expect(MIN_FACET_CONFIGS).toBe(3)
  })
})

describe('facetIntroLine', () => {
  it('states the count when the facet is a real subset', () => {
    expect(facetIntroLine(13, 23, 'show session cost', '2026-07-06')).toBe(
      "13 of the gallery's 23 status lines show session cost. Updated 2026-07-06.",
    )
  })
  it('drops the count sentence when every config matches (23 of 23 reads awkward)', () => {
    expect(facetIntroLine(23, 23, 'track context window usage', '2026-07-06')).toBe(
      'Updated 2026-07-06.',
    )
  })
  it('handles a missing updated date', () => {
    expect(facetIntroLine(13, 23, 'show session cost', null)).toBe(
      "13 of the gallery's 23 status lines show session cost.",
    )
    expect(facetIntroLine(23, 23, 'track context window usage', null)).toBe('')
  })
})
