import { usePostHog } from '@posthog/react'
import { Link, useNavigate } from '@tanstack/react-router'
import { X } from 'lucide-react'
import type { GalleryFilter } from '@/gallery/gallery-items'
import type { GallerySort } from '@/gallery/queries'
import { Button } from '@/ui/button'
import {
  DropdownMenu,
  DropdownMenuButtonTrigger,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
} from '@/ui/dropdown-menu'
import { Row } from '@/ui/layout'
import { SegmentedControl } from '@/ui/segmented-control'

const SORT_OPTIONS: { label: string; value: GallerySort }[] = [
  { label: 'Trending', value: 'trending' },
  { label: 'Top', value: 'top' },
  { label: 'New', value: 'new' },
]
const SORT_LABEL: Record<GallerySort, string> = { trending: 'Trending', top: 'Top', new: 'New' }
const KIND_OPTIONS: readonly { label: string; value: GalleryFilter }[] = [
  { label: 'All', value: 'all' },
  { label: 'Status lines', value: 'status-lines' },
  { label: 'Mods', value: 'mods' },
]

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
    })
  }
  return (
    <Row gap={2} wrap>
      <SegmentedControl label="Show" options={KIND_OPTIONS} value={kind} onValueChange={setKind} />

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

      {selected.size > 0 ? (
        <Button asChild variant="outline" size="icon-lg" aria-label="Clear filters">
          <Link
            from="/"
            to="/"
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
          </Link>
        </Button>
      ) : null}
    </Row>
  )
}
