import { describe, expect, it } from 'vitest'
import { cardClickProperties } from '@/gallery/card-analytics'

describe('cardClickProperties', () => {
  it('names the card and where it was clicked, with the gallery state it was clicked in', () => {
    expect(
      cardClickProperties(
        { slug: 'meter' },
        {
          surface: 'home',
          position: 3,
          page: 2,
          sort: 'top',
          selectedTags: ['git'],
          kind: 'mods',
        },
      ),
    ).toEqual({
      slug: 'meter',
      surface: 'home',
      position: 3,
      page: 2,
      sort: 'top',
      selectedTags: ['git'],
      kind: 'mods',
    })
  })

  it('leaves out the gallery state a surface does not have', () => {
    expect(cardClickProperties({ modId: 'mod-1' }, { surface: 'related', position: 1 })).toEqual({
      modId: 'mod-1',
      surface: 'related',
      position: 1,
    })
  })
})
