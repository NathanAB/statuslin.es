import { usePostHog } from '@posthog/react'
import { Link } from '@tanstack/react-router'
import { ChevronLeft, ChevronRight, X } from 'lucide-react'
import type { GalleryCardAnalytics } from '@/gallery/card-analytics'
import { GalleryConfigCard } from '@/gallery/config-card'
import { GalleryControls } from '@/gallery/gallery-controls'
import type { GalleryFilter, GalleryItem } from '@/gallery/gallery-items'
import type { GallerySort } from '@/gallery/queries'
import { homePaginationSearch } from '@/lib/canonical'
import { hashScrollOptions } from '@/lib/reduced-motion'
import { ModCard } from '@/mods/mod-card'
import { Button } from '@/ui/button'
import { GalleryList } from '@/ui/gallery-row'
import { HomeSection } from '@/ui/home-section'
import { Row, Stack } from '@/ui/layout'
import { Text } from '@/ui/text'
import { VisuallyHidden } from '@/ui/visually-hidden'

/** The gallery section's id: /#gallery lands on it. */
const GALLERY_ID = 'gallery'

/**
 * The home page's gallery: the sort and search with the pager beside them, one row per status line
 * or mod, and the same pager under them, real links to the pages before and after that land back
 * on the gallery. `rawKind`, `tags` and `query` are the URL's own values, so the page links keep
 * exactly what the URL asked for.
 */
export function HomeGallery({
  items,
  page,
  pageCount,
  sort,
  rawKind,
  tags,
  query,
}: {
  items: GalleryItem[]
  page: number
  pageCount: number
  sort: GallerySort
  rawKind: GalleryFilter | undefined
  tags: string | undefined
  /** The URL's search; `items`, `page` and `pageCount` are already its matches. */
  query?: string | undefined
}) {
  const posthog = usePostHog()
  const kind = rawKind ?? 'all'
  const selectedTags = tags ? tags.split(',') : []

  const cardAnalytics = (index: number): GalleryCardAnalytics => ({
    surface: 'home',
    position: index + 1,
    page,
    sort,
    selectedTags,
    kind,
  })
  const pageLink = (nextPage: number) => ({
    search: homePaginationSearch(nextPage, { sort, tags, kind: rawKind, q: query }),
    // Glide to the results, not back to the top, so the reader sees where the new page is. No
    // view transition here, unlike the search and sort: it would fight that scroll.
    hash: GALLERY_ID,
    hashScrollIntoView: hashScrollOptions(),
    onClick: () =>
      posthog.capture('gallery_page_changed', { page: nextPage, sort, selectedTags, kind }),
  })

  // The same pager above the list (beside the sort) and under it.
  const pager =
    pageCount > 1 ? (
      <nav aria-label="Gallery pages">
        <Row gap={4} align="center">
          <Text muted size="sm">
            Page {page} of {pageCount}
          </Text>
          <Row gap={3}>
            {page > 1 ? (
              <Button asChild variant="secondary" size="round" aria-label="Previous page">
                <Link to="/" {...pageLink(page - 1)}>
                  <ChevronLeft />
                </Link>
              </Button>
            ) : null}
            {page < pageCount ? (
              <Button asChild variant="secondary" size="pill" trailingIcon={<ChevronRight />}>
                <Link to="/" {...pageLink(page + 1)}>
                  Next page
                </Link>
              </Button>
            ) : null}
          </Row>
        </Row>
      </nav>
    ) : null

  return (
    <HomeSection id={GALLERY_ID}>
      <Stack gap={7}>
        <VisuallyHidden as="h2">Status lines and mods</VisuallyHidden>
        <Row gap={4} justify="between" wrap>
          <GalleryControls kind={kind} sort={sort} tags={selectedTags} query={query} />
          {pager}
        </Row>
        {items.length === 0 && query ? (
          <Row gap={4} wrap>
            <Text muted>Nothing matches “{query}”.</Text>
            <Button asChild variant="quiet" size="bar">
              <Link
                from="/"
                to="/"
                resetScroll={false}
                viewTransition
                search={(prev) => {
                  const { q: _q, ...rest } = prev
                  return rest
                }}
              >
                <X />
                Clear search
              </Link>
            </Button>
          </Row>
        ) : items.length === 0 ? (
          <Text muted>Nothing matches these filters yet.</Text>
        ) : (
          <GalleryList animateChanges>
            {items.map((item, index) =>
              item.kind === 'mod' ? (
                <ModCard
                  key={`mod:${item.card.slug}`}
                  card={item.card}
                  analytics={cardAnalytics(index)}
                />
              ) : (
                <GalleryConfigCard
                  key={`status-line:${item.card.slug}`}
                  card={item.card}
                  analytics={cardAnalytics(index)}
                />
              ),
            )}
          </GalleryList>
        )}
        {pager ? (
          <Row gap={4} justify="end">
            {pager}
          </Row>
        ) : null}
      </Stack>
    </HomeSection>
  )
}
