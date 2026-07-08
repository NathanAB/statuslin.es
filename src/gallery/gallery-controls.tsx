import { usePostHog } from '@posthog/react'
import { Link, useNavigate } from '@tanstack/react-router'
import { X } from 'lucide-react'
import { ALL_TAG_SLUGS, FACETS } from '@/gallery/facets'
import type { GallerySort } from '@/gallery/queries'
import { Button } from '@/ui/button'
import {
  DropdownMenu,
  DropdownMenuButtonTrigger,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
} from '@/ui/dropdown-menu'
import { Row } from '@/ui/layout'

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
export function GalleryControls({
  sort,
  tags,
  available,
}: {
  sort: GallerySort
  tags: string[]
  available: string[]
}) {
  const navigate = useNavigate()
  const posthog = usePostHog()
  const selected = new Set(tags)
  // Only offer tags at least one published config carries, so the filter never matches nothing.
  const availableSet = new Set(available)
  const facets = FACETS.filter((f) => availableSet.has(f.slug))

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
          label={selected.size > 0 ? `Filter · ${selected.size}` : 'Filter'}
          active={selected.size > 0}
        />
        <DropdownMenuContent>
          {facets.map((f) => (
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
        </DropdownMenuContent>
      </DropdownMenu>

      {selected.size > 0 ? (
        <Button asChild variant="outline" size="icon-lg" aria-label="Clear filters">
          <Link
            to="/"
            search={(prev) => {
              const { page: _page, tags: _tags, ...rest } = prev
              return rest
            }}
          >
            <X />
          </Link>
        </Button>
      ) : null}
    </Row>
  )
}
