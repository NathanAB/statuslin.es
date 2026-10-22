import type { ConfigPageCopy, ModPageCopy } from '@/content/types'
import { facetLabel } from './facets'

/** The longest search the gallery keeps. */
export const MAX_SEARCH_LENGTH = 100

/** What a search can find a status line or mod by. */
export interface SearchableItem {
  title: string
  description: string
  /** The author's GitHub login. */
  author: string | null
  tags: string[]
  copy: ConfigPageCopy | ModPageCopy | null
}

/** One published item's search text, joined to its gallery item by kind and slug. */
export interface GallerySearchText {
  slug: string
  searchText: string
}

/**
 * Everything a search matches an item on, lowercased once here so matching each keystroke
 * doesn't. Each tag counts by its slug and by the label its card shows.
 */
export function gallerySearchText({
  title,
  description,
  author,
  tags,
  copy,
}: SearchableItem): string {
  const details = copy ? Object.values(copy.details).flat() : []
  return [
    title,
    description,
    author,
    ...tags.flatMap((slug) => [slug, facetLabel(slug)]),
    copy?.summary,
    ...(copy?.howItWorks ?? []),
    ...(copy?.goodToKnow ?? []),
    ...details,
  ]
    .filter((field): field is string => typeof field === 'string' && field !== '')
    .join('\n')
    .toLowerCase()
}

/** A search as the URL keeps it: a trimmed string with single spaces, or undefined for none. */
export function normalizeSearchQuery(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const query = value.replace(/\s+/g, ' ').trim().slice(0, MAX_SEARCH_LENGTH).trimEnd()
  return query === '' ? undefined : query
}

/** True when every term of the query is in the search text; no query matches everything. */
export function matchesSearch(searchText: string, query: string | undefined): boolean {
  if (!query) return true
  return query
    .toLowerCase()
    .split(/\s+/)
    .every((term) => searchText.includes(term))
}
