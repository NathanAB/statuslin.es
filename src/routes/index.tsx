import { usePostHog } from '@posthog/react'
import { createFileRoute, Link } from '@tanstack/react-router'
import { getGallery } from '@/gallery/functions'
import { coercePage, coerceSort, type GallerySort } from '@/gallery/queries'
import { getSession } from '@/lib/auth-functions'
import { canonicalLink } from '@/lib/canonical'
import { homeJsonLd, jsonLdScript } from '@/lib/json-ld'
import { siteUrl } from '@/lib/site'
import { AuthorChip } from '@/ui/author-chip'
import { Button } from '@/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/ui/card'
import { ConfigBadges } from '@/ui/config-badges'
import { HomeHero } from '@/ui/home-hero'
import { Row, Stack } from '@/ui/layout'
import { PageShell } from '@/ui/shell'
import { StatuslinePreview } from '@/ui/statusline-preview'
import { StretchedLink } from '@/ui/stretched-link'
import { SubmitCta } from '@/ui/submit-cta'
import { Text } from '@/ui/text'
import { VisuallyHidden } from '@/ui/visually-hidden'

export const Route = createFileRoute('/')({
  // sort + page are optional in the URL (defaults: 'new', page 1), so Links to "/" can omit them.
  validateSearch: (search: Record<string, unknown>): { sort?: GallerySort; page?: number } => {
    const sort = coerceSort(search.sort)
    const page = coercePage(search.page)
    return { ...(sort === 'new' ? {} : { sort }), ...(page === 1 ? {} : { page }) }
  },
  loaderDeps: ({ search }) => ({ sort: search.sort, page: search.page }),
  loader: async ({ deps }) => ({
    user: await getSession(),
    gallery: await getGallery({ data: { sort: deps.sort ?? 'new', page: deps.page ?? 1 } }),
  }),
  head: ({ loaderData }) => ({
    meta: [
      { title: 'Claude Code Status Lines — Community Gallery | statuslin.es' },
      {
        name: 'description',
        content:
          'Browse a community gallery of Claude Code status lines — see rendered previews, upvote your favorites, and copy one into your own terminal in a single paste.',
      },
    ],
    links: [canonicalLink('/')],
    scripts: loaderData ? [jsonLdScript(homeJsonLd(siteUrl(), loaderData.gallery.cards))] : [],
  }),
  component: Home,
})

const SORT_TABS: { label: string; value: GallerySort }[] = [
  { label: 'New', value: 'new' },
  { label: 'Top', value: 'top' },
  { label: 'Trending', value: 'trending' },
]

function Home() {
  const posthog = usePostHog()
  const { user, gallery } = Route.useLoaderData()
  const { cards, page, pageCount } = gallery
  const sort = Route.useSearch().sort ?? 'new'

  return (
    <PageShell user={user}>
      <Stack gap={9}>
        <HomeHero />
        <Text muted size="sm" measure center>
          The status line is the bar at the bottom of your Claude Code terminal. Submit your own
          custom config for others, or find one you like and use it for yourself.
        </Text>
        <Stack gap={4}>
          <VisuallyHidden as="h2">Status lines</VisuallyHidden>
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
            <Card key={card.slug} interactive>
              <CardHeader>
                <Row gap={2} align="start" justify="between">
                  <Row gap={2}>
                    <CardTitle>
                      <StretchedLink to="/c/$slug" params={{ slug: card.slug }}>
                        {card.title}
                      </StretchedLink>
                    </CardTitle>
                    <Text muted size="sm">
                      ⇧ {card.upvoteCount}
                    </Text>
                  </Row>
                  <ConfigBadges
                    interpreter={card.interpreter}
                    networkHosts={card.networkHosts}
                    readsClaudeToken={card.readsClaudeToken}
                  />
                </Row>
              </CardHeader>
              <CardContent>
                <Stack gap={3}>
                  {card.preview !== null ? (
                    <StatuslinePreview segments={card.preview} />
                  ) : (
                    <Text muted size="sm">
                      No preview.
                    </Text>
                  )}
                  <Row gap={3} justify="between">
                    <Text muted size="sm" breakLong>
                      {card.description}
                    </Text>
                    <Row gap={1}>
                      <AuthorChip author={card.author} />
                    </Row>
                  </Row>
                </Stack>
              </CardContent>
            </Card>
          ))}
        </Stack>

        {pageCount > 1 ? (
          <Row gap={4} align="center" justify="center">
            {page > 1 ? (
              <Button asChild variant="ghost" size="sm">
                <Link to="/" search={{ sort, page: page - 1 }}>
                  ← Previous
                </Link>
              </Button>
            ) : null}
            <Text muted size="sm">
              Page {page} of {pageCount}
            </Text>
            {page < pageCount ? (
              <Button asChild variant="ghost" size="sm">
                <Link to="/" search={{ sort, page: page + 1 }}>
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
