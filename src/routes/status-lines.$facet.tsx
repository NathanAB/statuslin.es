import { createFileRoute, notFound } from '@tanstack/react-router'
import { GalleryConfigCard } from '@/gallery/config-card'
import { FACET_BY_SLUG } from '@/gallery/facets'
import { getFacetPage } from '@/gallery/functions'
import { getSession } from '@/lib/auth-functions'
import { canonicalLink } from '@/lib/canonical'
import { facetJsonLd, jsonLdScript } from '@/lib/json-ld'
import { NOT_FOUND_TITLE } from '@/lib/page-title'
import { siteUrl } from '@/lib/site'
import { staticPageSocialMeta } from '@/og/meta'
import { Row, Stack } from '@/ui/layout'
import { PageShell } from '@/ui/shell'
import { Heading, Text, TextLink } from '@/ui/text'
import { VisuallyHidden } from '@/ui/visually-hidden'

export const Route = createFileRoute('/status-lines/$facet')({
  loader: async ({ params }) => {
    const page = await getFacetPage({ data: { facet: params.facet } })
    if (!page) throw notFound()
    return { page, user: await getSession() }
  },
  head: ({ loaderData }) => {
    const facet = loaderData ? FACET_BY_SLUG.get(loaderData.page.slug) : undefined
    if (!facet || !loaderData) return { meta: [{ title: NOT_FOUND_TITLE }] }
    const path = `/status-lines/${facet.slug}`
    return {
      meta: [
        { title: `${facet.titleBase} | statuslin.es` },
        { name: 'description', content: facet.metaDescription },
        ...staticPageSocialMeta({
          path,
          title: facet.titleBase,
          description: facet.metaDescription,
        }),
      ],
      links: [canonicalLink(path)],
      scripts: facetJsonLd(
        siteUrl(),
        facet,
        loaderData.page.cards.map((c) => ({ slug: c.slug, title: c.title })),
      ).map(jsonLdScript),
    }
  },
  notFoundComponent: () => (
    <PageShell user={null}>
      <Text>No status lines here yet.</Text>
      <TextLink to="/">Back to gallery</TextLink>
    </PageShell>
  ),
  component: FacetPage,
})

function FacetPage() {
  const { page, user } = Route.useLoaderData()
  const facet = FACET_BY_SLUG.get(page.slug)
  if (!facet) return null
  return (
    <PageShell user={user}>
      <Stack gap={6}>
        <Stack gap={3}>
          <Heading level={1}>{facet.heading}</Heading>
          <Text muted size="sm" measure>
            {page.cards.length} of the gallery&apos;s {page.total} status lines {facet.countPhrase}.
            {page.updated ? ` Updated ${page.updated}.` : ''}
          </Text>
          {facet.intro.map((paragraph) => (
            <Text key={paragraph.slice(0, 24)} muted size="sm" measure>
              {paragraph}
            </Text>
          ))}
        </Stack>
        <Stack gap={4}>
          <VisuallyHidden as="h2">Status lines</VisuallyHidden>
          {page.cards.map((card) => (
            <GalleryConfigCard key={card.slug} card={card} />
          ))}
        </Stack>
        {page.otherFacets.length > 0 ? (
          <Row gap={2} wrap>
            <Text muted size="sm" inline>
              More ways to browse:
            </Text>
            {page.otherFacets.map((f) => (
              <TextLink key={f.slug} to="/status-lines/$facet" params={{ facet: f.slug }} size="sm">
                {f.chipLabel}
              </TextLink>
            ))}
          </Row>
        ) : null}
        <Text muted size="sm">
          New to Claude Code status lines? <TextLink to="/guide">Read the setup guide</TextLink>.
        </Text>
      </Stack>
    </PageShell>
  )
}
