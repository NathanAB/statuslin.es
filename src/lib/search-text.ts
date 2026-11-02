import { SITE_NAME } from '@/lib/site'

/** Fits page titles and meta descriptions to what a search result shows. */

export const PAGE_TITLE_BRAND = ` | ${SITE_NAME}`
export const PAGE_TITLE_MAX_LENGTH = 60
const META_DESCRIPTION_MAX_LENGTH = 160

export function normalizeWhitespace(value: string): string {
  return value.trim().replace(/\s+/g, ' ')
}

export function truncateAtWordBoundary(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value

  const contentLength = maxLength - 1
  const boundary = value.slice(0, contentLength).lastIndexOf(' ')
  const end = boundary > 0 ? boundary : contentLength
  return `${value.slice(0, end).trimEnd()}…`
}

/** `<name><keyword> | statuslin.es`, dropping the brand and then truncating the name to fit. */
export function keywordPageTitle(name: string, keyword: string): string {
  const normalizedName = normalizeWhitespace(name)
  const branded = `${normalizedName}${keyword}${PAGE_TITLE_BRAND}`
  if (branded.length <= PAGE_TITLE_MAX_LENGTH) return branded

  const nameBudget = PAGE_TITLE_MAX_LENGTH - keyword.length
  return `${truncateAtWordBoundary(normalizedName, nameBudget)}${keyword}`
}

/** `<name> | statuslin.es` under the same 60-character guard as status line and mod titles. */
export function brandedPageTitle(name: string): string {
  return keywordPageTitle(name, '')
}

export function metaDescription(description: string | null | undefined, fallback: string): string {
  const normalizedDescription = normalizeWhitespace(description ?? '')
  return truncateAtWordBoundary(normalizedDescription || fallback, META_DESCRIPTION_MAX_LENGTH)
}
