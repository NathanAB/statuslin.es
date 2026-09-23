import { usePostHog } from '@posthog/react'
import { createFileRoute, Link, notFound } from '@tanstack/react-router'
import { GalleryConfigCard } from '@/gallery/config-card'
import { getGallery } from '@/gallery/functions'
import { GalleryControls } from '@/gallery/gallery-controls'
import { HomeFeatureDirectory, HomeGalleryIntro, HomeIndexNote } from '@/gallery/home-gallery-intro'
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
import { Button } from '@/ui/button'
import { HomeHero, HomeMasthead } from '@/ui/home-hero'
import { Row, Stack } from '@/ui/layout'
import { PageShell } from '@/ui/shell'
import { SubmitCta } from '@/ui/submit-cta'
import { Text, TextLink } from '@/ui/text'
import { VisuallyHidden } from '@/ui/visually-hidden'

export const Route = createFileRoute('/')({
  // sort + page + tags are optional in the URL (defaults: 'trending', page 1, no filter), so Links to "/" can omit them.
  validateSearch: (
    search: Record<string, unknown>,
  ): { sort?: GallerySort; page?: number; tags?: string } => {
    const sort = coerceSort(search.sort)
    const page = coercePage(search.page)
    const tags = coerceTags(search.tags).join(',')
    return {
      ...(sort === 'trending' ? {} : { sort }),
      ...(page === 1 ? {} : { page }),
      ...(tags === '' ? {} : { tags }),
    }
  },
  loaderDeps: ({ search }) => ({ sort: search.sort, page: search.page, tags: search.tags }),
  loader: async ({ deps }) => {
    const gallery = await getGallery({
      data: {
        sort: deps.sort ?? 'trending',
        page: deps.page ?? 1,
        ...(deps.tags ? { tags: deps.tags } : {}),
      },
    })
    if (!gallery) throw notFound()
    return { user: await getSession(), gallery }
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
      // No loaderData means the page is past the end (a 404): no canonical for it.
      links: loaderData ? [canonicalLink(homeCanonicalPath(page, match.search))] : [],
      scripts: loaderData
        ? homeJsonLd(siteUrl(), loaderData.gallery.cards, {
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
  const { cards, page, pageCount, publishedCount, copyCount, asOf, facets } = gallery
  const { sort: rawSort, tags } = Route.useSearch()
  const sort = rawSort ?? 'trending'
  const selectedTags = tags ? tags.split(',') : []
  const posthog = usePostHog()

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
        <Stack gap={4}>
          <HomeMasthead>
            <HomeHero page={page} />
            <HomeGalleryIntro />
          </HomeMasthead>
          <HomeFeatureDirectory facets={facets} />
        </Stack>
        <Stack gap={4}>
          <VisuallyHidden as="h2">Status lines</VisuallyHidden>
          <Row gap={4} justify="between" wrap>
            <GalleryControls
              sort={sort}
              tags={tags ? tags.split(',') : []}
              available={gallery.availableTags}
            />
            <SubmitCta signedIn={!!user} />
          </Row>
          {cards.map((card, index) => (
            <GalleryConfigCard
              key={card.slug}
              card={card}
              analytics={{
                surface: 'home',
                position: index + 1,
                page,
                sort,
                selectedTags,
              }}
            />
          ))}
        </Stack>

        {pageCount > 1 ? (
          <Row gap={4} align="center" justify="center">
            {page > 1 ? (
              <Button asChild variant="ghost" size="sm">
                <Link
                  to="/"
                  onClick={() => trackPageChange(page - 1)}
                  search={homePaginationSearch(page - 1, {
                    sort,
                    ...(tags ? { tags } : {}),
                  })}
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
                  search={homePaginationSearch(page + 1, {
                    sort,
                    ...(tags ? { tags } : {}),
                  })}
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
