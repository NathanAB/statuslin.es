import type { AnsiSegment } from '@/render/types'
import { type GalleryCard, galleryPageWindow, PAGE_SIZE } from './queries'

/** The home grid's kind filter, kept in the URL; `all` is the default and stays out of it. */
export type GalleryFilter = 'all' | 'status-lines' | 'mods'

/** The route maps mod data into this shape, since src/gallery cannot import src/mods. */
export interface GalleryModCard {
  modId: string
  slug: string
  title: string
  description: string
  authorGithub: string
  copyCount: number
  tags: string[]
  preview: AnsiSegment[] | null
  desktopScreenshot: string | null
}

export type GalleryItem =
  | { kind: 'status-line'; card: GalleryCard }
  | { kind: 'mod'; card: GalleryModCard }

export type GalleryKind = GalleryItem['kind']

/** An item with its value under the active sort: larger first, null (never published) last. */
export interface RankedGalleryItem {
  item: GalleryItem
  sortKey: number | null
}

/** One kind's items, already in sort order, and how many that kind has in all. */
export interface GallerySource {
  items: RankedGalleryItem[]
  total: number
}

const FILTER_KINDS: Record<GalleryFilter, GalleryKind[]> = {
  all: ['status-line', 'mod'],
  'status-lines': ['status-line'],
  mods: ['mod'],
}

export function coerceGalleryFilter(value: unknown): GalleryFilter {
  return value === 'status-lines' || value === 'mods' ? value : 'all'
}

/** One list from several sorted sources. The sort is stable, so ties keep each source's order. */
export function mergeGalleryItems(sources: RankedGalleryItem[][]): GalleryItem[] {
  const key = (ranked: RankedGalleryItem) => ranked.sortKey ?? Number.NEGATIVE_INFINITY
  return sources
    .flat()
    .sort((a, b) => key(b) - key(a))
    .map((ranked) => ranked.item)
}

/**
 * One page of the gallery. Each kind the filter includes is asked for its first `page * PAGE_SIZE`
 * items: every item on the merged page is within that prefix of its own kind.
 */
export async function loadGalleryPage(
  query: { page: number; filter: GalleryFilter },
  loaders: Record<GalleryKind, (limit: number) => Promise<GallerySource>>,
): Promise<{ items: GalleryItem[]; page: number; pageCount: number } | null> {
  const sources = await Promise.all(
    FILTER_KINDS[query.filter].map((kind) => loaders[kind](query.page * PAGE_SIZE)),
  )
  const total = sources.reduce((sum, source) => sum + source.total, 0)
  const window = galleryPageWindow(query.page, total)
  if (!window) return null
  const start = (window.page - 1) * PAGE_SIZE
  return {
    items: mergeGalleryItems(sources.map((source) => source.items)).slice(start, start + PAGE_SIZE),
    ...window,
  }
}
