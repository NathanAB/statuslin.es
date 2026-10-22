import { usePostHog } from '@posthog/react'
import { Link, useNavigate } from '@tanstack/react-router'
import { X } from 'lucide-react'
import type { GalleryFilter } from '@/gallery/gallery-items'
import type { GallerySort } from '@/gallery/queries'
import { Button } from '@/ui/button'
import { Row } from '@/ui/layout'
import { SegmentedControl } from '@/ui/segmented-control'

const SORT_OPTIONS: readonly { label: string; value: GallerySort }[] = [
  { label: 'Trending', value: 'trending' },
  { label: 'Top', value: 'top' },
  { label: 'New', value: 'new' },
]
/**
 * The gallery's sort, then a way to clear what a link filtered it by (tags, or a kind from an old
 * `?kind=` link: status lines and mods are one list, with no control to split them). Every control
 * writes the URL.
 */
export function GalleryControls({
  kind,
  sort,
  tags,
}: {
  kind: GalleryFilter
  sort: GallerySort
  tags: string[]
}) {
  // From '/', so `prev` is the gallery's search alone, not every route's.
  const navigate = useNavigate({ from: '/' })
  // Every control here only changes the search, so the reader stays where they were instead of
  // the router's default jump to the top of the page.
  const posthog = usePostHog()
  const filtered = tags.length > 0 || kind !== 'all'

  const setSort = (value: GallerySort) => {
    posthog.capture('gallery_sort_changed', {
      sort: value,
      selectedTags: tags,
      page: 1,
      kind,
    })
    navigate({
      to: '/',
      search: (prev) => {
        const { page: _page, ...rest } = prev
        return { ...rest, sort: value }
      },
      resetScroll: false,
    })
  }
  return (
    <Row gap={4} wrap>
      <SegmentedControl
        label="Sort"
        look="tray"
        options={SORT_OPTIONS}
        value={sort}
        onValueChange={setSort}
      />
      {filtered ? (
        <Button asChild variant="quiet" size="bar">
          <Link
            from="/"
            to="/"
            resetScroll={false}
            onClick={() => {
              posthog.capture('gallery_filter_changed', {
                action: 'clear',
                selectedTags: [],
                sort,
                page: 1,
                kind,
              })
            }}
            search={(prev) => {
              const { page: _page, tags: _tags, kind: _kind, ...rest } = prev
              return rest
            }}
          >
            <X />
            Clear filters
          </Link>
        </Button>
      ) : null}
    </Row>
  )
}
