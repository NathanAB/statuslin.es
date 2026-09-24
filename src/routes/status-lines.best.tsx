import { createFileRoute } from '@tanstack/react-router'
import { getBestPage } from '@/gallery/functions'
import { RankedCardList } from '@/gallery/ranked-card-list'
import { getSession } from '@/lib/auth-functions'
import { canonicalLink } from '@/lib/canonical'
import { jsonLdScript } from '@/lib/json-ld'
import { configListPageJsonLd } from '@/lib/json-ld-lists'
import { siteUrl } from '@/lib/site'
import { staticPageSocialMeta } from '@/og/meta'
import { Stack } from '@/ui/layout'
import { PageShell } from '@/ui/shell'
import { Heading, Text, TextLink } from '@/ui/text'

const PATH = '/status-lines/best'
const TITLE_BASE = 'Best Claude Code Status Lines (Most Copied)'
const DESCRIPTION =
  'The most-copied Claude Code status lines in the gallery, ranked by copies. Each one has a real rendered preview, a one-line summary, and a one-paste install.'

export const Route = createFileRoute('/status-lines/best')({
  loader: async () => ({ page: await getBestPage(), user: await getSession() }),
  head: ({ loaderData }) => ({
    meta: [
      { title: `${TITLE_BASE} | statuslin.es` },
      { name: 'description', content: DESCRIPTION },
      ...staticPageSocialMeta({ path: PATH, title: TITLE_BASE, description: DESCRIPTION }),
    ],
    links: [canonicalLink(PATH)],
    scripts: configListPageJsonLd(
      siteUrl(),
      { path: PATH, name: TITLE_BASE },
      (loaderData?.page.items ?? []).map(({ card }) => ({ slug: card.slug, title: card.title })),
    ).map(jsonLdScript),
  }),
  component: BestPage,
})

function BestPage() {
  const { page, user } = Route.useLoaderData()
  return (
    <PageShell user={user}>
      <Stack gap={6}>
        <Stack gap={3}>
          <Heading level={1}>Best Claude Code status lines</Heading>
          <Text muted measure>
            The {page.items.length} status lines copied most often from statuslin.es, as of{' '}
            {page.asOf}. Every preview is rendered from the real script, and every entry was
            reviewed by a person before it was published.
          </Text>
          <Text muted measure>
            Comparing tools instead?{' '}
            <TextLink to="/compare/$pair" params={{ pair: 'ccstatusline-vs-claude-powerline' }}>
              ccstatusline vs claude-powerline
            </TextLink>
            .
          </Text>
        </Stack>
        <RankedCardList items={page.items} surface="best" ranked />
      </Stack>
    </PageShell>
  )
}
