import { usePostHog } from '@posthog/react'
import { Link } from '@tanstack/react-router'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import type { GalleryCardAnalytics } from '@/gallery/card-analytics'
import { GalleryConfigCard } from '@/gallery/config-card'
import { GalleryControls } from '@/gallery/gallery-controls'
import type { GalleryFilter, GalleryItem } from '@/gallery/gallery-items'
import type { GallerySort } from '@/gallery/queries'
import { homePaginationSearch } from '@/lib/canonical'
import { ModCard } from '@/mods/mod-card'
import { Button } from '@/ui/button'
import { GalleryList } from '@/ui/gallery-row'
import { HomeSection } from '@/ui/home-section'
import { Row, Stack } from '@/ui/layout'
import { Reveal } from '@/ui/reveal'
import { Text } from '@/ui/text'
import { VisuallyHidden } from '@/ui/visually-hidden'

/** The gallery section's id: /#gallery lands on it. */
const GALLERY_ID = 'gallery'

/**
 * The home page's gallery: the filter heading and sort, one row per status line or mod, and real
 * links to the pages before and after. `rawKind` and `tags` are the URL's own values, so the page
 * links keep exactly what the URL asked for.
 */
export function HomeGallery({
  items,
  page,
  pageCount,
  sort,
  rawKind,
  tags,
}: {
  items: GalleryItem[]
  page: number
  pageCount: number
  sort: GallerySort
  rawKind: GalleryFilter | undefined
  tags: string | undefined
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
    search: homePaginationSearch(nextPage, { sort, tags, kind: rawKind }),
    onClick: () =>
      posthog.capture('gallery_page_changed', { page: nextPage, sort, selectedTags, kind }),
  })

  return (
    <HomeSection id={GALLERY_ID}>
      <Stack gap={7}>
        <VisuallyHidden as="h2">Status lines and mods</VisuallyHidden>
        <Reveal>
          <GalleryControls kind={kind} sort={sort} tags={selectedTags} />
        </Reveal>
        {items.length === 0 ? (
          <Text muted>Nothing matches these filters yet.</Text>
        ) : (
          <GalleryList>
            {items.map((item, index) => (
              <Reveal key={`${item.kind}:${item.card.slug}`}>
                {item.kind === 'mod' ? (
                  <ModCard card={item.card} analytics={cardAnalytics(index)} />
                ) : (
                  <GalleryConfigCard card={item.card} analytics={cardAnalytics(index)} />
                )}
              </Reveal>
            ))}
          </GalleryList>
        )}
        {pageCount > 1 ? (
          <Row gap={4} justify="between">
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
        ) : null}
      </Stack>
    </HomeSection>
  )
}
