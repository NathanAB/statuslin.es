import { createFileRoute, notFound } from '@tanstack/react-router'
import { getConfigSearchTexts, getGalleryConfigs } from '@/gallery/functions'
import {
  coerceGalleryFilter,
  type GalleryFilter,
  galleryView,
  loadGalleryEntries,
} from '@/gallery/gallery-items'
import {
  coercePage,
  coerceSort,
  coerceTags,
  type GallerySort,
  galleryPageWindow,
  PAGE_SIZE,
} from '@/gallery/queries'
import { normalizeSearchQuery } from '@/gallery/search'
import { HomeGallery } from '@/home/home-gallery'
import { HomeHero } from '@/home/home-hero'
import { loadShowcase } from '@/home/load-showcase'
import { getSession } from '@/lib/auth-functions'
import { canonicalLink, homeCanonicalPath, isFilteredHomeSearch } from '@/lib/canonical'
import { homeJsonLd, jsonLdScript } from '@/lib/json-ld'
import { HOME_HERO_HEADING, homeMetaDescription, homePageTitle } from '@/lib/page-title'
import { siteUrl } from '@/lib/site'
import { getGalleryModsFn, getModSearchTextsFn } from '@/mods/gallery-functions'
import { homeSocialMeta } from '@/og/meta'
import { HomeSection } from '@/ui/home-section'
import { PageShell } from '@/ui/shell'
import { Text, TextLink } from '@/ui/text'
import { VisuallyHidden } from '@/ui/visually-hidden'

export const Route = createFileRoute('/')({
  // sort, page, tags, kind and the search q are optional in the URL (defaults: 'trending', page 1,
  // no tags, all kinds, no search), so Links to "/" can omit them. q is always returned, undefined
  // when it isn't a search: the router lays this result over the raw URL search, so an omitted key
  // would let an array or object through.
  validateSearch: (
    search: Record<string, unknown>,
  ): {
    sort?: GallerySort
    page?: number
    tags?: string
    kind?: GalleryFilter
    q?: string | undefined
  } => {
    const sort = coerceSort(search.sort)
    const page = coercePage(search.page)
    const tags = coerceTags(search.tags).join(',')
    const kind = coerceGalleryFilter(search.kind)
    const q = normalizeSearchQuery(search.q)
    return {
      ...(sort === 'trending' ? {} : { sort }),
      ...(page === 1 ? {} : { page }),
      ...(tags === '' ? {} : { tags }),
      ...(kind === 'all' ? {} : { kind }),
      q,
    }
  },
  // The loader returns every item, so paging and searching (page, q) filter in the browser and
  // rerun no loader.
  loaderDeps: ({ search }) => ({
    sort: search.sort,
    tags: search.tags,
    kind: search.kind,
  }),
  loader: async ({ deps, location }) => {
    const sort = deps.sort ?? 'trending'
    const tags = coerceTags(deps.tags)
    // The showcase (the hero's list) is the same whatever the gallery shows.
    const [entries, showcase] = await Promise.all([
      loadGalleryEntries(deps.kind ?? 'all', {
        'status-line': {
          items: () => getGalleryConfigs({ data: { sort, tags } }),
          searchText: () => getConfigSearchTexts(),
        },
        mod: {
          items: () => getGalleryModsFn({ data: { sort, tags } }),
          searchText: () => getModSearchTextsFn(),
        },
      }),
      loadShowcase(),
    ])
    const { page } = location.search as { page?: unknown }
    if (!galleryPageWindow(coercePage(page), entries.length)) throw notFound()
    return {
      user: await getSession(),
      entries,
      showcase,
    }
  },
  head: ({ loaderData, match }) => {
    const view = loaderData
      ? galleryView(loaderData.entries, { page: match.search.page ?? 1, q: match.search.q })
      : undefined
    const page = view?.page ?? 1
    const pageCount = view?.pageCount ?? 1
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
      scripts: view
        ? homeJsonLd(
            siteUrl(),
            view.items.map(({ kind, card }) => ({
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
  const { user, entries, showcase } = Route.useLoaderData()
  const search = Route.useSearch()
  const { items, page, pageCount } = galleryView(entries, {
    page: search.page ?? 1,
    q: search.q,
  })

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
        sort={search.sort ?? 'trending'}
        rawKind={search.kind}
        tags={search.tags}
        query={search.q}
      />
    </PageShell>
  )
}
