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
const KIND_OPTIONS: readonly { label: string; value: GalleryFilter }[] = [
  { label: 'All', value: 'all' },
  { label: 'Status lines', value: 'status-lines' },
  { label: 'Mods', value: 'mods' },
]

/**
 * The gallery's heading row: what it shows (All, Status lines, Mods) set as the visible heading,
 * then a way to clear a tag filter and the sort on the right. Every control writes the URL.
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
  const selected = new Set(tags)

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
  const setKind = (value: GalleryFilter) => {
    posthog.capture('gallery_kind_changed', {
      kind: value,
      previousKind: kind,
      sort,
      selectedTags: tags,
    })
    navigate({
      to: '/',
      search: (prev) => {
        const { page: _page, kind: _kind, ...rest } = prev
        return value === 'all' ? rest : { ...rest, kind: value }
      },
      resetScroll: false,
    })
  }
  return (
    <Row gap={4} justify="between" wrap>
      <SegmentedControl
        label="Show"
        look="heading"
        options={KIND_OPTIONS}
        value={kind}
        onValueChange={setKind}
      />
      <Row gap={4} wrap>
        {selected.size > 0 ? (
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
                const { page: _page, tags: _tags, ...rest } = prev
                return rest
              }}
            >
              <X />
              Clear filters
            </Link>
          </Button>
        ) : null}
        <SegmentedControl
          label="Sort"
          look="tray"
          options={SORT_OPTIONS}
          value={sort}
          onValueChange={setSort}
        />
      </Row>
    </Row>
  )
}
