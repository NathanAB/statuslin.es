import { usePostHog } from '@posthog/react'
import { useNavigate } from '@tanstack/react-router'
import { ALL_TAG_SLUGS, FACETS } from '@/gallery/facets'
import type { GallerySort } from '@/gallery/queries'
import {
  DropdownMenu,
  DropdownMenuButtonTrigger,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
} from '@/ui/dropdown-menu'
import { Row } from '@/ui/layout'
import { TextLink } from '@/ui/text'

const SORT_OPTIONS: { label: string; value: GallerySort }[] = [
  { label: 'Trending', value: 'trending' },
  { label: 'Top', value: 'top' },
  { label: 'New', value: 'new' },
]
const SORT_LABEL: Record<GallerySort, string> = { trending: 'Trending', top: 'Top', new: 'New' }

/** Builds the canonical `?tags=` CSV (registry order, de-duped) from the tags a user has toggled on. */
export function buildTagsCsv(selected: Set<string>): string | undefined {
  const csv = ALL_TAG_SLUGS.filter((slug) => selected.has(slug)).join(',')
  return csv === '' ? undefined : csv
}

/** Sort single-select + tag multiselect controls for the home gallery. Both navigate on
 * change, preserving the other's current search param and resetting `page`. */
export function GalleryControls({ sort, tags }: { sort: GallerySort; tags: string[] }) {
  const navigate = useNavigate()
  const posthog = usePostHog()
  const selected = new Set(tags)

  const setSort = (value: GallerySort) => {
    posthog.capture('gallery_sort_changed', { sort: value })
    navigate({
      to: '/',
      search: (prev) => {
        const { page: _page, ...rest } = prev
        return { ...rest, sort: value }
      },
    })
  }
  const toggleTag = (slug: string) => {
    const next = new Set(selected)
    if (next.has(slug)) {
      next.delete(slug)
    } else {
      next.add(slug)
    }
    const csv = buildTagsCsv(next)
    navigate({
      to: '/',
      search: (prev) => {
        const { page: _page, tags: _tags, ...rest } = prev
        return { ...rest, ...(csv ? { tags: csv } : {}) }
      },
    })
  }

  return (
    <Row gap={2}>
      <DropdownMenu>
        <DropdownMenuButtonTrigger label={`Sort: ${SORT_LABEL[sort]}`} />
        <DropdownMenuContent>
          <DropdownMenuRadioGroup value={sort} onValueChange={(v) => setSort(v as GallerySort)}>
            {SORT_OPTIONS.map((o) => (
              <DropdownMenuRadioItem key={o.value} value={o.value}>
                {o.label}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>

      <DropdownMenu>
        <DropdownMenuButtonTrigger
          label={selected.size > 0 ? `Tags · ${selected.size}` : 'Tags'}
          active={selected.size > 0}
        />
        <DropdownMenuContent>
          {FACETS.map((f) => (
            <DropdownMenuCheckboxItem
              key={f.slug}
              checked={selected.has(f.slug)}
              // preventDefault keeps the menu open while toggling multiple tags
              onSelect={(e) => {
                e.preventDefault()
                toggleTag(f.slug)
              }}
            >
              {f.chipLabel}
            </DropdownMenuCheckboxItem>
          ))}
          {selected.size > 0 ? (
            <TextLink
              to="/"
              search={(prev) => {
                const { page: _page, tags: _tags, ...rest } = prev
                return rest
              }}
            >
              Clear tags
            </TextLink>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
    </Row>
  )
}
