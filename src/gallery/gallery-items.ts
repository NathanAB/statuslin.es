import type { AnsiSegment } from '@/render/types'
import type { DesktopShotImage } from '@/ui/desktop-shot'
import { type GalleryCard, galleryPageCount, PAGE_SIZE } from './queries'
import { type GallerySearchText, matchesSearch } from './search'

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
  /** Null when there is nothing to show: no result yet, or the mod drew nothing there. */
  preview: AnsiSegment[] | null
  desktopShot: DesktopShotImage | null
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

/** `items` arrive already in sort order. */
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

/** The sort is stable, so ties keep each source's order. */
export function mergeGalleryItems(sources: RankedGalleryItem[][]): GalleryItem[] {
  const key = (ranked: RankedGalleryItem) => ranked.sortKey ?? Number.NEGATIVE_INFINITY
  return sources
    .flat()
    .sort((a, b) => key(b) - key(a))
    .map((ranked) => ranked.item)
}

/** A gallery item with the text a search matches it on. */
export interface HomeGalleryEntry {
  item: GalleryItem
  searchText: string
}

/** One kind's whole ranked list, and the search text of each of its published items. */
export interface GalleryKindLoaders {
  items: () => Promise<GallerySource>
  searchText: () => Promise<GallerySearchText[]>
}

/** Every item of the kinds the filter includes, in gallery order, each with its search text. */
export async function loadGalleryEntries(
  filter: GalleryFilter,
  loaders: Record<GalleryKind, GalleryKindLoaders>,
): Promise<HomeGalleryEntry[]> {
  const kinds = FILTER_KINDS[filter]
  const [sources, texts] = await Promise.all([
    Promise.all(kinds.map((kind) => loaders[kind].items())),
    Promise.all(kinds.map((kind) => loaders[kind].searchText())),
  ])
  const textByKey = new Map(
    kinds.flatMap((kind, index) =>
      (texts[index] ?? []).map((row) => [`${kind}:${row.slug}`, row.searchText] as const),
    ),
  )
  return mergeGalleryItems(sources.map((source) => source.items)).map((item) => ({
    item,
    searchText: textByKey.get(`${item.kind}:${item.card.slug}`) ?? '',
  }))
}

/**
 * What the gallery shows for a page and a search: that page of the matching items, and their
 * counts. A page past the end of the matches shows their last page.
 */
export function galleryView(
  entries: HomeGalleryEntry[],
  { page, q }: { page: number; q: string | undefined },
): { items: GalleryItem[]; page: number; pageCount: number; total: number } {
  const matches = entries.filter((entry) => matchesSearch(entry.searchText, q))
  const pageCount = galleryPageCount(matches.length)
  const shown = Math.min(page, pageCount)
  const start = (shown - 1) * PAGE_SIZE
  return {
    items: matches.slice(start, start + PAGE_SIZE).map((entry) => entry.item),
    page: shown,
    pageCount,
    total: matches.length,
  }
}
