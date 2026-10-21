import { createFileRoute, notFound } from '@tanstack/react-router'
import { getGallery, getGalleryConfigs } from '@/gallery/functions'
import { coerceGalleryFilter, type GalleryFilter, loadGalleryPage } from '@/gallery/gallery-items'
import { HomeIndexNote } from '@/gallery/home-gallery-intro'
import { coercePage, coerceSort, coerceTags, type GallerySort, PAGE_SIZE } from '@/gallery/queries'
import { HomeGallery } from '@/home/home-gallery'
import { HomeHero } from '@/home/home-hero'
import { HomeResultsHeading } from '@/home/home-results-heading'
import { loadShowcase } from '@/home/load-showcase'
import { getSession } from '@/lib/auth-functions'
import { canonicalLink, homeCanonicalPath, isFilteredHomeSearch } from '@/lib/canonical'
import { homeJsonLd, jsonLdScript } from '@/lib/json-ld'
import { HOME_HEADING, homeMetaDescription, homePageTitle } from '@/lib/page-title'
import { siteUrl } from '@/lib/site'
import { getGalleryModsFn } from '@/mods/gallery-functions'
import { homeSocialMeta } from '@/og/meta'
import { HomeSection } from '@/ui/home-section'
import { PageShell } from '@/ui/shell'
import { Text, TextLink } from '@/ui/text'

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
    // The showcase (the hero's list) is the same whatever the gallery shows.
    const [listing, gallery, showcase] = await Promise.all([
      loadGalleryPage(
        { page: deps.page ?? 1, filter: deps.kind ?? 'all' },
        {
          'status-line': (limit) => getGalleryConfigs({ data: { sort, tags, limit } }),
          mod: (limit) => getGalleryModsFn({ data: { sort, tags, limit } }),
        },
      ),
      getGallery(),
      loadShowcase(),
    ])
    if (!listing) throw notFound()
    return {
      user: await getSession(),
      gallery: { ...gallery, ...listing },
      showcase,
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
  const { user, gallery, showcase } = Route.useLoaderData()
  const { items, page, pageCount, statusLines, mods, copyCount, asOf } = gallery
  const { sort, tags, kind } = Route.useSearch()

  return (
    <PageShell
      user={user}
      fullBleed
      footerNote={
        <HomeIndexNote statusLines={statusLines} mods={mods} copyCount={copyCount} asOf={asOf} />
      }
    >
      {page > 1 ? null : (
        <HomeSection first>
          <HomeHero heading={HOME_HEADING} items={showcase.hero} />
        </HomeSection>
      )}
      <HomeGallery
        items={items}
        page={page}
        pageCount={pageCount}
        sort={sort ?? 'trending'}
        rawKind={kind}
        tags={tags}
        {...(page > 1 ? { heading: <HomeResultsHeading page={page} /> } : {})}
      />
    </PageShell>
  )
}
