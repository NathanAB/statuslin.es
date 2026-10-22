import { useNavigate } from '@tanstack/react-router'
import { useEffect, useRef, useState } from 'react'
import { normalizeSearchQuery } from '@/gallery/search'
import { SearchField } from '@/ui/search-field'

/** How long typing pauses before the list follows the search box. */
export const SEARCH_DEBOUNCE_MS = 200

/**
 * The gallery's search box. It shows each keystroke at once; once typing pauses, the URL's `q`
 * follows (from page 1, replacing the history entry), and the list filters from the URL. When `q`
 * changes elsewhere (back, Clear search), the box shows it. `params` are the URL's other gallery
 * values, which a search without JavaScript keeps.
 */
export function GallerySearch({
  query,
  params,
}: {
  query: string | undefined
  params: Record<string, string | undefined>
}) {
  const navigate = useNavigate({ from: '/' })
  const [text, setText] = useState(query ?? '')
  const pending = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  useEffect(() => {
    // While a search waits to apply, the box is ahead of the URL, not behind it.
    if (pending.current !== undefined) return
    setText((shown) => (normalizeSearchQuery(shown) === query ? shown : (query ?? '')))
  }, [query])

  useEffect(() => () => clearTimeout(pending.current), [])

  const onValueChange = (value: string) => {
    setText(value)
    clearTimeout(pending.current)
    pending.current = setTimeout(() => {
      pending.current = undefined
      const q = normalizeSearchQuery(value)
      navigate({
        to: '/',
        search: (prev) => {
          // A change only in spacing is the same search: keep the reader's page.
          if (prev.q === q) return prev
          const { page: _page, q: _q, ...rest } = prev
          return q === undefined ? rest : { ...rest, q }
        },
        replace: true,
        resetScroll: false,
      })
    }, SEARCH_DEBOUNCE_MS)
  }

  return (
    <SearchField
      label="Search status lines and mods"
      placeholder="Search"
      action="/"
      name="q"
      params={params}
      value={text}
      onValueChange={onValueChange}
    />
  )
}
