import { createFileRoute } from '@tanstack/react-router'
import { getBestPage } from '@/gallery/functions'
import { RankedCardList } from '@/gallery/ranked-card-list'
import { getSession } from '@/lib/auth-functions'
import { canonicalLink } from '@/lib/canonical'
import { jsonLdScript } from '@/lib/json-ld'
import { configListPageJsonLd } from '@/lib/json-ld-lists'
import { brandedPageTitle } from '@/lib/page-title'
import { siteUrl } from '@/lib/site'
import { staticPageSocialMeta } from '@/og/meta'
import { Stack } from '@/ui/layout'
import { PageShell } from '@/ui/shell'
import { Heading, Text, TextLink } from '@/ui/text'

const PATH = '/status-lines/best'
const DESCRIPTION =
  'The most-copied Claude Code status lines on statuslin.es, ranked by copies, each with a preview rendered from the real script and a one-paste install.'

const MONTH = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })

/** " (October 2026)" from the newest copy's UTC day, or nothing before the first copy. */
function monthSuffix(latestCopy: string | null): string {
  return latestCopy ? ` (${MONTH.format(new Date(latestCopy))})` : ''
}

function rankedLines(count: number): string {
  return count === 1 ? 'The most-copied status line' : `The ${count} most-copied status lines`
}

export const Route = createFileRoute('/status-lines/best')({
  loader: async () => ({ page: await getBestPage(), user: await getSession() }),
  head: ({ loaderData }) => {
    const titleBase = `Best Claude Code Status Lines${monthSuffix(loaderData?.page.latestCopy ?? null)}`
    return {
      meta: [
        { title: brandedPageTitle(titleBase) },
        { name: 'description', content: DESCRIPTION },
        ...staticPageSocialMeta({ path: PATH, title: titleBase, description: DESCRIPTION }),
      ],
      links: [canonicalLink(PATH)],
      scripts: configListPageJsonLd(
        siteUrl(),
        { path: PATH, name: titleBase },
        (loaderData?.page.items ?? []).map(({ card }) => ({ slug: card.slug, title: card.title })),
      ).map(jsonLdScript),
    }
  },
  component: BestPage,
})

function BestPage() {
  const { page, user } = Route.useLoaderData()
  return (
    <PageShell user={user}>
      <Stack gap={6}>
        <Stack gap={3}>
          <Heading level={1}>Best Claude Code status lines{monthSuffix(page.latestCopy)}</Heading>
          <Text muted>
            {rankedLines(page.items.length)} on statuslin.es
            {page.latestCopy ? ` as of ${page.latestCopy}` : ''}. Each preview is the script's real
            output.
          </Text>
          <Text muted>
            Comparing tools?{' '}
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
