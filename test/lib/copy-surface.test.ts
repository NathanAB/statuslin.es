import { describe, expect, it } from 'vitest'
import { copySurface } from '@/lib/copy-surface'

describe('copySurface', () => {
  // A theme card's install copy says where it happened: /themes, or the home page's themes row.
  it('keeps the themes page and the home themes row apart from a page copy', () => {
    expect(copySurface('themes')).toBe('themes')
    expect(copySurface('home_themes')).toBe('home_themes')
    expect(copySurface('home_hero')).toBe('home_hero')
  })

  it('counts an unknown surface as a page copy, since the browser sends it', () => {
    for (const surface of ['theme', 'home-themes', '', undefined, 42]) {
      expect(copySurface(surface)).toBe('page')
    }
  })
})
