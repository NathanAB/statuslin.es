import { usePostHog } from '@posthog/react'
import { createFileRoute, Link } from '@tanstack/react-router'
import { GalleryConfigCard } from '@/gallery/config-card'
import { getGallery } from '@/gallery/functions'
import { coercePage, coerceSort, coerceTags, type GallerySort } from '@/gallery/queries'
import { getSession } from '@/lib/auth-functions'
import { canonicalLink, homeCanonicalPath } from '@/lib/canonical'
import { homeJsonLd, jsonLdScript } from '@/lib/json-ld'
import { HOME_TITLE_BASE } from '@/lib/page-title'
import { siteUrl } from '@/lib/site'
import { Button } from '@/ui/button'
import { HomeHero } from '@/ui/home-hero'
import { Row, Stack } from '@/ui/layout'
import { PageShell } from '@/ui/shell'
import { SubmitCta } from '@/ui/submit-cta'
import { Text } from '@/ui/text'
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
  loader: async ({ deps }) => ({
    user: await getSession(),
    gallery: await getGallery({
      data: {
        sort: deps.sort ?? 'trending',
        page: deps.page ?? 1,
        ...(deps.tags ? { tags: deps.tags } : {}),
      },
    }),
  }),
  head: ({ loaderData }) => ({
    meta: [
      { title: `${HOME_TITLE_BASE} | statuslin.es` },
      {
        name: 'description',
        content:
          'Browse a community gallery of Claude Code status lines — see rendered previews, upvote your favorites, and copy one into your own terminal in a single paste.',
      },
    ],
    links: [canonicalLink(homeCanonicalPath(loaderData?.gallery.page ?? 1))],
    scripts: loaderData ? [jsonLdScript(homeJsonLd(siteUrl(), loaderData.gallery.cards))] : [],
  }),
  component: Home,
})

const SORT_TABS: { label: string; value: GallerySort }[] = [
  { label: 'Trending', value: 'trending' },
  { label: 'Top', value: 'top' },
  { label: 'New', value: 'new' },
]

function Home() {
  const posthog = usePostHog()
  const { user, gallery } = Route.useLoaderData()
  const { cards, page, pageCount } = gallery
  const { sort: rawSort, tags } = Route.useSearch()
  const sort = rawSort ?? 'trending'

  return (
    <PageShell user={user}>
      <Stack gap={9}>
        <HomeHero />
        <Text muted size="sm" measure center>
          The status line is the bar at the bottom of your Claude Code terminal. Browse what other
          people run, copy one you like, or submit your own.
        </Text>
        <Stack gap={4}>
          <VisuallyHidden as="h2">Status lines</VisuallyHidden>
          {/* TODO(task-10): replace this SORT_TABS row with <GalleryControls>. */}
          <Row gap={4} justify="between" wrap>
            <Row gap={1}>
              {SORT_TABS.map((tab) => (
                <Button
                  key={tab.value}
                  asChild
                  variant={sort === tab.value ? 'outline' : 'ghost'}
                  size="lg"
                  active={sort === tab.value}
                >
                  <Link
                    to="/"
                    search={{ sort: tab.value }}
                    onClick={() => posthog.capture('gallery_sort_changed', { sort: tab.value })}
                  >
                    {tab.label}
                  </Link>
                </Button>
              ))}
            </Row>
            <SubmitCta signedIn={!!user} />
          </Row>
          {cards.map((card) => (
            <GalleryConfigCard key={card.slug} card={card} />
          ))}
        </Stack>

        {pageCount > 1 ? (
          <Row gap={4} align="center" justify="center">
            {page > 1 ? (
              <Button asChild variant="ghost" size="sm">
                <Link to="/" search={{ sort, page: page - 1, ...(tags ? { tags } : {}) }}>
                  ← Previous
                </Link>
              </Button>
            ) : null}
            <Text muted size="sm">
              Page {page} of {pageCount}
            </Text>
            {page < pageCount ? (
              <Button asChild variant="ghost" size="sm">
                <Link to="/" search={{ sort, page: page + 1, ...(tags ? { tags } : {}) }}>
                  Next →
                </Link>
              </Button>
            ) : null}
          </Row>
        ) : null}
      </Stack>
    </PageShell>
  )
}
