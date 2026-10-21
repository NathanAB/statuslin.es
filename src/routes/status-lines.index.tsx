import { createFileRoute } from '@tanstack/react-router'
import { DetailBreadcrumb } from '@/gallery/detail-breadcrumb'
import { BrowseOnLinks } from '@/gallery/facet-links'
import { topicHeading } from '@/gallery/facet-page-copy'
import { getFacetHub } from '@/gallery/hub-functions'
import { kindCount } from '@/gallery/kind-count'
import { getSession } from '@/lib/auth-functions'
import { STATUS_LINES_CRUMB } from '@/lib/breadcrumb-json-ld'
import { canonicalLink } from '@/lib/canonical'
import { facetHubJsonLd, jsonLdScript } from '@/lib/json-ld'
import {
  brandedPageTitle,
  STATUS_LINES_DESCRIPTION,
  STATUS_LINES_HEADING,
  STATUS_LINES_PATH,
  STATUS_LINES_TITLE_BASE,
} from '@/lib/page-title'
import { siteUrl } from '@/lib/site'
import { getPublishedModTagsFn } from '@/mods/gallery-functions'
import { staticPageSocialMeta } from '@/og/meta'
import { Card, CardDescription, CardHeader, CardTitle } from '@/ui/card'
import { Grid, Stack } from '@/ui/layout'
import { PageShell } from '@/ui/shell'
import { StretchedLink } from '@/ui/stretched-link'
import { Heading, Text } from '@/ui/text'

export const Route = createFileRoute('/status-lines/')({
  loader: async () => {
    const [topics, user] = await Promise.all([
      getPublishedModTagsFn().then((modTags) => getFacetHub({ data: { modTags } })),
      getSession(),
    ])
    return { topics, user }
  },
  head: ({ loaderData }) => {
    const topics = loaderData?.topics ?? []
    return {
      meta: [
        { title: brandedPageTitle(STATUS_LINES_TITLE_BASE) },
        { name: 'description', content: STATUS_LINES_DESCRIPTION },
        ...(topics.length === 0 ? [{ name: 'robots', content: 'noindex, follow' } as const] : []),
        ...staticPageSocialMeta({
          path: STATUS_LINES_PATH,
          title: STATUS_LINES_TITLE_BASE,
          description: STATUS_LINES_DESCRIPTION,
        }),
      ],
      links: [canonicalLink(STATUS_LINES_PATH)],
      scripts: facetHubJsonLd(
        siteUrl(),
        topics.map((topic) => ({ slug: topic.slug, heading: topicHeading(topic) })),
      ).map(jsonLdScript),
    }
  },
  component: StatusLinesHub,
})

function StatusLinesHub() {
  const { topics, user } = Route.useLoaderData()
  return (
    <PageShell user={user}>
      <Stack gap={6}>
        <Stack gap={3}>
          <DetailBreadcrumb trail={[]} title={STATUS_LINES_CRUMB.name} />
          <Heading level={1}>{STATUS_LINES_HEADING}</Heading>
          <Text muted>
            Each topic page lists the status lines and mods that show it, each with a real preview.
          </Text>
        </Stack>
        <Grid>
          {topics.map((topic) => (
            <Card key={topic.slug} interactive>
              <CardHeader>
                <CardTitle level={2}>
                  <StretchedLink to="/status-lines/$facet" params={{ facet: topic.slug }}>
                    {topicHeading(topic)}
                  </StretchedLink>
                </CardTitle>
                <CardDescription>{kindCount(topic.statusLines, topic.mods)}</CardDescription>
              </CardHeader>
            </Card>
          ))}
        </Grid>
        <BrowseOnLinks />
      </Stack>
    </PageShell>
  )
}
