import { describe, expect, it, vi } from 'vitest'
import {
  coerceGalleryFilter,
  type GalleryItem,
  type GalleryModCard,
  type GallerySource,
  loadGalleryPage,
  mergeGalleryItems,
  type RankedGalleryItem,
} from '@/gallery/gallery-items'
import { type GalleryCard, MAX_GALLERY_PAGE, PAGE_SIZE } from '@/gallery/queries'

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
    desktopScreenshot: null,
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

function source(items: RankedGalleryItem[], total = items.length): GallerySource {
  return { items, total }
}

describe('loadGalleryPage', () => {
  const statusLines = source([statusLine('a', 3), statusLine('b', 1)])
  const mods = source([mod('x', 2)])

  it('returns both kinds for the All filter', async () => {
    const page = await loadGalleryPage(
      { page: 1, filter: 'all' },
      { 'status-line': async () => statusLines, mod: async () => mods },
    )
    expect(page?.items.map(label)).toEqual(['status-line:a', 'mod:x', 'status-line:b'])
  })

  it('returns only mods, and never loads status lines, for the Mods filter', async () => {
    const loadStatusLines = vi.fn(async () => statusLines)
    const page = await loadGalleryPage(
      { page: 1, filter: 'mods' },
      { 'status-line': loadStatusLines, mod: async () => mods },
    )
    expect(page?.items.map(label)).toEqual(['mod:x'])
    expect(loadStatusLines).not.toHaveBeenCalled()
  })

  it('returns only status lines for the Status lines filter', async () => {
    const loadMods = vi.fn(async () => mods)
    const page = await loadGalleryPage(
      { page: 1, filter: 'status-lines' },
      { 'status-line': async () => statusLines, mod: loadMods },
    )
    expect(page?.items.map(label)).toEqual(['status-line:a', 'status-line:b'])
    expect(loadMods).not.toHaveBeenCalled()
  })

  it('asks each kind for the prefix up to the page end and counts pages over both kinds', async () => {
    const limits: number[] = []
    const many = (kind: typeof statusLine, prefix: string, count: number) =>
      Array.from({ length: count }, (_, i) => kind(`${prefix}${i}`, count - i))
    const page = await loadGalleryPage(
      { page: 2, filter: 'all' },
      {
        'status-line': async (limit) => {
          limits.push(limit)
          return source(many(statusLine, 's', PAGE_SIZE + 3))
        },
        mod: async (limit) => {
          limits.push(limit)
          return source(many(mod, 'm', 3))
        },
      },
    )
    expect(limits).toEqual([2 * PAGE_SIZE, 2 * PAGE_SIZE])
    expect(page?.pageCount).toBe(2)
    expect(page?.items).toHaveLength(6)
  })

  it('returns null for a page past the end', async () => {
    const page = await loadGalleryPage(
      { page: 2, filter: 'mods' },
      { 'status-line': async () => statusLines, mod: async () => mods },
    )
    expect(page).toBeNull()
  })

  it('refuses a page past the last one the gallery serves without loading anything', async () => {
    const load = vi.fn(async () => statusLines)
    const page = await loadGalleryPage(
      { page: MAX_GALLERY_PAGE + 1, filter: 'all' },
      { 'status-line': load, mod: load },
    )
    expect(page).toBeNull()
    expect(load).not.toHaveBeenCalled()
  })
})
