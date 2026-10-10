import { describe, expect, it } from 'vitest'
import { MAX_GALLERY_PAGE, PAGE_SIZE } from '@/gallery/queries'
import { coerceSourceQuery, type GallerySourceQuery } from '@/gallery/ranking'

const untrusted = (value: unknown) => value as GallerySourceQuery

describe('coerceSourceQuery', () => {
  it('keeps a well-formed query', () => {
    expect(coerceSourceQuery({ sort: 'top', tags: ['git'], limit: 20 })).toEqual({
      sort: 'top',
      tags: ['git'],
      limit: 20,
    })
  })

  it('falls back to trending, drops unknown tags and floors the limit at 1', () => {
    expect(
      coerceSourceQuery(untrusted({ sort: 'loudest', tags: ['git', 'nope', 7], limit: -5 })),
    ).toEqual({ sort: 'trending', tags: ['git'], limit: 1 })
  })

  it('caps the limit at the last page the gallery serves', () => {
    expect(coerceSourceQuery({ sort: 'top', limit: 1_000_000_000 }).limit).toBe(
      MAX_GALLERY_PAGE * PAGE_SIZE,
    )
  })

  it('treats a non-array tags value as no tags and leaves an absent limit absent', () => {
    expect(coerceSourceQuery(untrusted({ sort: 'new', tags: 'git' }))).toEqual({
      sort: 'new',
      tags: [],
    })
  })
})
