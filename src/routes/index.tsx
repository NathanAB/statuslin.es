import { usePostHog } from '@posthog/react'
import { createFileRoute, Link, notFound } from '@tanstack/react-router'
import { GalleryConfigCard } from '@/gallery/config-card'
import { DesktopNote } from '@/gallery/desktop-note'
import { getGallery, getGalleryConfigs } from '@/gallery/functions'
import { GalleryControls } from '@/gallery/gallery-controls'
import {
  coerceGalleryFilter,
  type GalleryFilter,
  type GalleryItem,
  loadGalleryPage,
} from '@/gallery/gallery-items'
import { HomeGalleryIntro, HomeIndexNote } from '@/gallery/home-gallery-intro'
import {
  coercePage,
  coerceSort,
  coerceTags,
  type GalleryCard,
  type GallerySort,
  PAGE_SIZE,
} from '@/gallery/queries'
import { getSession } from '@/lib/auth-functions'
import {
  canonicalLink,
  homeCanonicalPath,
  homePaginationSearch,
  isFilteredHomeSearch,
} from '@/lib/canonical'
import { homeJsonLd, jsonLdScript } from '@/lib/json-ld'
import { homeMetaDescription, homePageTitle } from '@/lib/page-title'
import { siteUrl } from '@/lib/site'
import { getGalleryModsFn, getPublishedModTagsFn } from '@/mods/gallery-functions'
import { ModCard } from '@/mods/mod-card'
import { Button } from '@/ui/button'
import { HomeHero, HomeMasthead } from '@/ui/home-hero'
import { Row, Stack } from '@/ui/layout'
import { PageShell } from '@/ui/shell'
import { SubmitCta } from '@/ui/submit-cta'
import { Text, TextLink } from '@/ui/text'
import { VisuallyHidden } from '@/ui/visually-hidden'

export const Route = createFileRoute('/')({
  // sort, page, tags and kind are optional in the URL (defaults: 'trending', page 1, no tags, all
  // kinds), so Links to "/" can omit them.
  validateSearch: (
    search: Record<string, unknown>,
  ): { sort?: GallerySort; page?: number; tags?: string; kind?: GalleryFilter } => {
    const sort = coerceSort(search.sort)
    const page = coercePage(search.page)
    const tags = coerceTags(search.tags).join(',')
    const kind = coerceGalleryFilter(search.kind)
    return {
      ...(sort === 'trending' ? {} : { sort }),
      ...(page === 1 ? {} : { page }),
      ...(tags === '' ? {} : { tags }),
      ...(kind === 'all' ? {} : { kind }),
    }
  },
  loaderDeps: ({ search }) => ({
    sort: search.sort,
    page: search.page,
    tags: search.tags,
    kind: search.kind,
  }),
  loader: async ({ deps }) => {
    const sort = deps.sort ?? 'trending'
    const tags = coerceTags(deps.tags)
    const [listing, gallery] = await Promise.all([
      loadGalleryPage(
        { page: deps.page ?? 1, filter: deps.kind ?? 'all' },
        {
          'status-line': (limit) => getGalleryConfigs({ data: { sort, tags, limit } }),
          mod: (limit) => getGalleryModsFn({ data: { sort, tags, limit } }),
        },
      ),
      getPublishedModTagsFn().then((modTags) => getGallery({ data: { modTags } })),
    ])
    if (!listing) throw notFound()
    return { user: await getSession(), gallery: { ...gallery, ...listing } }
  },
  head: ({ loaderData, match }) => {
    const page = loaderData?.gallery.page ?? 1
    const pageCount = loaderData?.gallery.pageCount ?? 1
    const isFiltered = isFilteredHomeSearch(match.search)
    return {
      meta: [
        { title: homePageTitle(page) },
        { name: 'description', content: homeMetaDescription(page, pageCount) },
        ...(isFiltered ? [{ name: 'robots', content: 'noindex, follow' }] : []),
      ],
      links: loaderData ? [canonicalLink(homeCanonicalPath(page, match.search))] : [],
      scripts: loaderData
        ? homeJsonLd(siteUrl(), statusLineCards(loaderData.gallery.items), {
            page,
            pageSize: PAGE_SIZE,
            includeCollectionPage: !isFiltered,
          }).map(jsonLdScript)
        : [],
    }
  },
  notFoundComponent: () => (
    <PageShell user={null}>
      <Text>There is no gallery page with that number.</Text>
      <TextLink to="/">Back to gallery</TextLink>
    </PageShell>
  ),
  component: Home,
})

function Home() {
  const { user, gallery } = Route.useLoaderData()
  const { items, page, pageCount, publishedCount, copyCount, asOf } = gallery
  const { sort: rawSort, tags, kind } = Route.useSearch()
  const sort = rawSort ?? 'trending'
  const selectedTags = tags ? tags.split(',') : []
  const posthog = usePostHog()

  const pageSearch = (nextPage: number) => homePaginationSearch(nextPage, { sort, tags, kind })

  const trackPageChange = (nextPage: number) => {
    posthog.capture('gallery_page_changed', {
      page: nextPage,
      sort,
      selectedTags,
    })
  }

  return (
    <PageShell user={user}>
      <Stack gap={9}>
        <Stack gap={6}>
          <HomeMasthead>
            <HomeHero />
            <HomeGalleryIntro page={page} />
          </HomeMasthead>
          <DesktopNote surface="home" />
        </Stack>
        <Stack gap={4}>
          <VisuallyHidden as="h2">Status lines and mods</VisuallyHidden>
          <Row gap={4} justify="between" wrap>
            <GalleryControls
              kind={kind ?? 'all'}
              sort={sort}
              tags={tags ? tags.split(',') : []}
              available={gallery.availableTags}
            />
            <SubmitCta signedIn={!!user} />
          </Row>
          {items.length === 0 ? <Text muted>Nothing matches these filters yet.</Text> : null}
          {items.map((item, index) =>
            item.kind === 'mod' ? (
              <ModCard key={`mod:${item.card.slug}`} card={item.card} />
            ) : (
              <GalleryConfigCard
                key={`status-line:${item.card.slug}`}
                card={item.card}
                analytics={{
                  surface: 'home',
                  position: index + 1,
                  page,
                  sort,
                  selectedTags,
                }}
              />
            ),
          )}
        </Stack>

        {pageCount > 1 ? (
          <Row gap={4} align="center" justify="center">
            {page > 1 ? (
              <Button asChild variant="ghost" size="sm">
                <Link
                  to="/"
                  onClick={() => trackPageChange(page - 1)}
                  search={pageSearch(page - 1)}
                >
                  ← Previous
                </Link>
              </Button>
            ) : null}
            <Text muted size="sm">
              Page {page} of {pageCount}
            </Text>
            {page < pageCount ? (
              <Button asChild variant="ghost" size="sm">
                <Link
                  to="/"
                  onClick={() => trackPageChange(page + 1)}
                  search={pageSearch(page + 1)}
                >
                  Next →
                </Link>
              </Button>
            ) : null}
          </Row>
        ) : null}
        <HomeIndexNote publishedCount={publishedCount} copyCount={copyCount} asOf={asOf} />
      </Stack>
    </PageShell>
  )
}

/** JSON-LD lists config pages only; its item URLs are `/c/<slug>`. */
function statusLineCards(items: GalleryItem[]): GalleryCard[] {
  return items.flatMap((item) => (item.kind === 'status-line' ? [item.card] : []))
}
