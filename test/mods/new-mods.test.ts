import { describe, expect, it } from 'vitest'
import type { GalleryItem, GalleryModCard } from '@/gallery/gallery-items'
import { selectNewMods } from '@/mods/new-mods'

function mod(slug: string): GalleryModCard {
  return {
    modId: slug,
    slug,
    title: slug,
    description: '',
    authorGithub: 'octocat',
    copyCount: 0,
    tags: [],
    preview: null,
    desktopShot: null,
  }
}

const gridMod = (slug: string): GalleryItem => ({ kind: 'mod', card: mod(slug) })

describe('selectNewMods', () => {
  it('takes the newest two', () => {
    expect(selectNewMods([mod('a'), mod('b'), mod('c')], []).map((m) => m.slug)).toEqual(['a', 'b'])
  })

  it('skips mods the grid already shows and fills from the next newest', () => {
    const picked = selectNewMods(
      [mod('a'), mod('b'), mod('c'), mod('d')],
      [gridMod('a'), gridMod('c')],
    )
    expect(picked.map((m) => m.slug)).toEqual(['b', 'd'])
  })

  it('returns fewer when not enough mods are left', () => {
    expect(selectNewMods([mod('a'), mod('b')], [gridMod('a')]).map((m) => m.slug)).toEqual(['b'])
  })
})
