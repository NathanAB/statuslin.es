import { describe, expect, it } from 'vitest'
import { brandedPageTitle } from '@/lib/search-text'

describe('brandedPageTitle', () => {
  it('adds the brand when the whole title fits in 60 characters', () => {
    expect(brandedPageTitle('Minimal Claude Code Status Lines & Mods')).toBe(
      'Minimal Claude Code Status Lines & Mods | statuslin.es',
    )
  })

  it('drops the brand, then truncates, to stay within 60 characters', () => {
    expect(brandedPageTitle('Catppuccin, Dracula & Themed Claude Code Status Lines')).toBe(
      'Catppuccin, Dracula & Themed Claude Code Status Lines',
    )
    expect(
      brandedPageTitle('A facet title long enough that it cannot fit even without the brand'),
    ).toBe('A facet title long enough that it cannot fit even without…')
  })
})
