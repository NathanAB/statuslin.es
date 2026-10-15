import { usePostHog } from '@posthog/react'
import { createFileRoute, Link, notFound } from '@tanstack/react-router'
import type { GalleryCardAnalytics } from '@/gallery/card-analytics'
import { GalleryConfigCard } from '@/gallery/config-card'
import { getGallery, getGalleryConfigs } from '@/gallery/functions'
import { GalleryControls } from '@/gallery/gallery-controls'
import { coerceGalleryFilter, type GalleryFilter, loadGalleryPage } from '@/gallery/gallery-items'
import { HomeGalleryIntro, HomeIndexNote } from '@/gallery/home-gallery-intro'
import { coercePage, coerceSort, coerceTags, type GallerySort, PAGE_SIZE } from '@/gallery/queries'
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
import { FeaturedModRow } from '@/mods/featured-mod-row'
import { getFeaturedModFn, getGalleryModsFn } from '@/mods/gallery-functions'
import { ModCard } from '@/mods/mod-card'
import { homeSocialMeta } from '@/og/meta'
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
    // The "Featured mod" row shows on page 1 whatever the sort, tags or kind, so switching filters
    // doesn't move the controls under it.
    const [listing, gallery, featuredMod] = await Promise.all([
      loadGalleryPage(
        { page: deps.page ?? 1, filter: deps.kind ?? 'all' },
        {
          'status-line': (limit) => getGalleryConfigs({ data: { sort, tags, limit } }),
          mod: (limit) => getGalleryModsFn({ data: { sort, tags, limit } }),
        },
      ),
      getGallery(),
      deps.page === undefined ? getFeaturedModFn() : null,
    ])
    if (!listing) throw notFound()
    return {
      user: await getSession(),
      gallery: { ...gallery, ...listing },
      featuredMod,
    }
  },
  head: ({ loaderData, match }) => {
    const page = loaderData?.gallery.page ?? 1
    const pageCount = loaderData?.gallery.pageCount ?? 1
    const isFiltered = isFilteredHomeSearch(match.search)
    const canonical = canonicalLink(homeCanonicalPath(page, match.search))
    return {
      meta: [
        { title: homePageTitle(page) },
        { name: 'description', content: homeMetaDescription(page, pageCount) },
        ...(isFiltered ? [{ name: 'robots', content: 'noindex, follow' }] : []),
        ...(loaderData ? homeSocialMeta({ url: canonical.href, page, pageCount }) : []),
      ],
      links: loaderData ? [canonical] : [],
      scripts: loaderData
        ? homeJsonLd(
            siteUrl(),
            loaderData.gallery.items.map(({ kind, card }) => ({
              kind,
              slug: card.slug,
              title: card.title,
            })),
            {
              page,
              pageSize: PAGE_SIZE,
              includeCollectionPage: !isFiltered,
            },
          ).map(jsonLdScript)
        : [],
    }
  },
  notFoundComponent: () => (
    <PageShell user={null}>
      <Text>That gallery page doesn't exist.</Text>
      <TextLink to="/">Back to gallery</TextLink>
    </PageShell>
  ),
  component: Home,
})

function Home() {
  const { user, gallery, featuredMod } = Route.useLoaderData()
  const { items, page, pageCount, statusLines, mods, copyCount, asOf } = gallery
  const { sort: rawSort, tags, kind: rawKind } = Route.useSearch()
  const sort = rawSort ?? 'trending'
  const kind = rawKind ?? 'all'
  const selectedTags = tags ? tags.split(',') : []
  const posthog = usePostHog()

  const pageSearch = (nextPage: number) =>
    homePaginationSearch(nextPage, { sort, tags, kind: rawKind })

  const cardAnalytics = (index: number): GalleryCardAnalytics => ({
    surface: 'home',
    position: index + 1,
    page,
    sort,
    selectedTags,
    kind,
  })

  const trackPageChange = (nextPage: number) => {
    posthog.capture('gallery_page_changed', {
      page: nextPage,
      sort,
      selectedTags,
      kind,
    })
  }

  return (
    <PageShell user={user}>
      <Stack gap={9}>
        <HomeMasthead>
          <HomeHero />
          <HomeGalleryIntro page={page} />
        </HomeMasthead>
        <FeaturedModRow mod={featuredMod} />
        <Stack gap={4}>
          <VisuallyHidden as="h2">Status lines and mods</VisuallyHidden>
          <Row gap={4} justify="between" wrap>
            <GalleryControls kind={kind} sort={sort} tags={tags ? tags.split(',') : []} />
            <SubmitCta signedIn={!!user} />
          </Row>
          {items.length === 0 ? <Text muted>Nothing matches these filters yet.</Text> : null}
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
        <HomeIndexNote statusLines={statusLines} mods={mods} copyCount={copyCount} asOf={asOf} />
      </Stack>
    </PageShell>
  )
}
