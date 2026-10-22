import { createFileRoute, notFound } from '@tanstack/react-router'
import { getGalleryConfigs } from '@/gallery/functions'
import { coerceGalleryFilter, type GalleryFilter, loadGalleryPage } from '@/gallery/gallery-items'
import { coercePage, coerceSort, coerceTags, type GallerySort, PAGE_SIZE } from '@/gallery/queries'
import { HomeGallery } from '@/home/home-gallery'
import { HomeHero } from '@/home/home-hero'
import { loadShowcase } from '@/home/load-showcase'
import { getSession } from '@/lib/auth-functions'
import { canonicalLink, homeCanonicalPath, isFilteredHomeSearch } from '@/lib/canonical'
import { homeJsonLd, jsonLdScript } from '@/lib/json-ld'
import { HOME_HERO_HEADING, homeMetaDescription, homePageTitle } from '@/lib/page-title'
import { siteUrl } from '@/lib/site'
import { getGalleryModsFn } from '@/mods/gallery-functions'
import { homeSocialMeta } from '@/og/meta'
import { HomeSection } from '@/ui/home-section'
import { PageShell } from '@/ui/shell'
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
    // The showcase (the hero's list) is the same whatever the gallery shows.
    const [listing, showcase] = await Promise.all([
      loadGalleryPage(
        { page: deps.page ?? 1, filter: deps.kind ?? 'all' },
        {
          'status-line': (limit) => getGalleryConfigs({ data: { sort, tags, limit } }),
          mod: (limit) => getGalleryModsFn({ data: { sort, tags, limit } }),
        },
      ),
      loadShowcase(),
    ])
    if (!listing) throw notFound()
    return {
      user: await getSession(),
      gallery: listing,
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
  const { items, page, pageCount } = gallery
  const { sort, tags, kind } = Route.useSearch()

  return (
    <PageShell user={user} fullBleed>
      {/* On every page, so paging changes only the list; the page links land on the gallery. Past
          page 1 the h1 names the page for search engines and screen readers. */}
      <HomeSection first>
        <HomeHero
          heading={
            <>
              {HOME_HERO_HEADING}
              {page > 1 ? <VisuallyHidden>, page {page}</VisuallyHidden> : null}
            </>
          }
          items={showcase.hero}
        />
      </HomeSection>
      <HomeGallery
        items={items}
        page={page}
        pageCount={pageCount}
        sort={sort ?? 'trending'}
        rawKind={kind}
        tags={tags}
      />
    </PageShell>
  )
}
