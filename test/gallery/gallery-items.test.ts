import { describe, expect, it, vi } from 'vitest'
import {
  coerceGalleryFilter,
  type GalleryItem,
  type GalleryModCard,
  type GallerySource,
  galleryView,
  loadGalleryEntries,
  mergeGalleryItems,
  type RankedGalleryItem,
} from '@/gallery/gallery-items'
import { type GalleryCard, PAGE_SIZE } from '@/gallery/queries'

function statusLine(slug: string, sortKey: number | null): RankedGalleryItem {
  const card: GalleryCard = {
    configId: `config-${slug}`,
    slug,
    title: slug,
    description: '',
    interpreter: 'bash',
    copyCount: 0,
    author: null,
    preview: null,
    networkHosts: [],
    readsClaudeToken: false,
    tags: [],
  }
  return { item: { kind: 'status-line', card }, sortKey }
}

function mod(slug: string, sortKey: number | null): RankedGalleryItem {
  const card: GalleryModCard = {
    modId: `mod-${slug}`,
    slug,
    title: slug,
    description: '',
    authorGithub: 'octocat',
    copyCount: 0,
    tags: [],
    preview: null,
    desktopShot: null,
  }
  return { item: { kind: 'mod', card }, sortKey }
}

const label = (item: GalleryItem) => `${item.kind}:${item.card.slug}`

describe('mergeGalleryItems', () => {
  it('interleaves both kinds by sort key, largest first', () => {
    const merged = mergeGalleryItems([
      [statusLine('a', 9), statusLine('b', 4), statusLine('c', 1)],
      [mod('x', 7), mod('y', 4)],
    ])
    expect(merged.map(label)).toEqual([
      'status-line:a',
      'mod:x',
      'status-line:b',
      'mod:y',
      'status-line:c',
    ])
  })

  it('puts items with no sort key (never published) last', () => {
    const merged = mergeGalleryItems([[statusLine('undated', null)], [mod('dated', 1)]])
    expect(merged.map(label)).toEqual(['mod:dated', 'status-line:undated'])
  })

  it('keeps each source in the order it arrived when keys tie', () => {
    const merged = mergeGalleryItems([
      [statusLine('s2', 0), statusLine('s1', 0)],
      [mod('m2', 0), mod('m1', 0)],
    ])
    expect(merged.map(label)).toEqual(['status-line:s2', 'status-line:s1', 'mod:m2', 'mod:m1'])
  })
})

describe('coerceGalleryFilter', () => {
  it('accepts the two kinds and defaults anything else to all', () => {
    expect(coerceGalleryFilter('status-lines')).toBe('status-lines')
    expect(coerceGalleryFilter('mods')).toBe('mods')
    expect(coerceGalleryFilter('plugins')).toBe('all')
    expect(coerceGalleryFilter(undefined)).toBe('all')
  })
})

function source(items: RankedGalleryItem[]): GallerySource {
  return { items, total: items.length }
}

const texts = (rows: Array<[string, string]>) => async () =>
  rows.map(([slug, searchText]) => ({ slug, searchText }))

describe('loadGalleryEntries', () => {
  const statusLines = source([statusLine('a', 3), statusLine('b', 1)])
  const mods = source([mod('a', 2)])
  const loaders = {
    'status-line': {
      items: async () => statusLines,
      searchText: texts([
        ['a', 'status line a'],
        ['b', 'status line b'],
      ]),
    },
    mod: { items: async () => mods, searchText: texts([['a', 'mod a']]) },
  }

  it('lists both kinds in gallery order, each with the search text of its own kind and slug', async () => {
    const entries = await loadGalleryEntries('all', loaders)
    expect(entries.map(({ item, searchText }) => [label(item), searchText])).toEqual([
      ['status-line:a', 'status line a'],
      ['mod:a', 'mod a'],
      ['status-line:b', 'status line b'],
    ])
  })

  it('loads only the kinds the filter includes', async () => {
    const loadStatusLines = vi.fn(async () => statusLines)
    const entries = await loadGalleryEntries('mods', {
      ...loaders,
      'status-line': { ...loaders['status-line'], items: loadStatusLines },
    })
    expect(entries.map(({ item }) => label(item))).toEqual(['mod:a'])
    expect(loadStatusLines).not.toHaveBeenCalled()
  })
})

describe('galleryView', () => {
  const entries = Array.from({ length: PAGE_SIZE + 3 }, (_, i) => ({
    item: statusLine(`line-${i}`, null).item,
    searchText: i % 2 === 0 ? `even line ${i}` : `odd line ${i}`,
  }))
  const slugs = (items: GalleryItem[]) => items.map((item) => item.card.slug)

  it('pages the whole list without a search', () => {
    const first = galleryView(entries, { page: 1, q: undefined })
    expect(first).toMatchObject({ page: 1, pageCount: 2, total: PAGE_SIZE + 3 })
    expect(slugs(first.items)).toEqual(slugs(entries.slice(0, PAGE_SIZE).map((e) => e.item)))
    expect(slugs(galleryView(entries, { page: 2, q: undefined }).items)).toEqual([
      `line-${PAGE_SIZE}`,
      `line-${PAGE_SIZE + 1}`,
      `line-${PAGE_SIZE + 2}`,
    ])
  })

  it('lists and counts only the entries the search matches', () => {
    const view = galleryView(entries, { page: 1, q: 'ODD' })
    expect(view).toMatchObject({ page: 1, pageCount: 1, total: 6 })
    expect(slugs(view.items)).toEqual(['line-1', 'line-3', 'line-5', 'line-7', 'line-9', 'line-11'])
  })

  it('shows the last page of the matches for a page past their end', () => {
    const view = galleryView(entries, { page: 2, q: 'even' })
    expect(view).toMatchObject({ page: 1, pageCount: 1, total: 7 })
    expect(view.items).toHaveLength(7)
  })

  it('shows an empty page 1 when nothing matches', () => {
    expect(galleryView(entries, { page: 3, q: 'nothing' })).toEqual({
      items: [],
      page: 1,
      pageCount: 1,
      total: 0,
    })
  })
})
