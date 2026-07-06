import { createFileRoute } from '@tanstack/react-router'
import { getGuideHighlights } from '@/guide/functions'
import { GuideContent } from '@/guide/guide-content'
import { getSession } from '@/lib/auth-functions'
import { canonicalLink } from '@/lib/canonical'
import { guideJsonLd, jsonLdScript } from '@/lib/json-ld'
import { GUIDE_TITLE_BASE } from '@/lib/page-title'
import { siteUrl } from '@/lib/site'
import { staticPageSocialMeta } from '@/og/meta'
import { PageShell } from '@/ui/shell'

const DESCRIPTION =
  'How to set up a Claude Code status line: the statusLine setting, the JSON your script receives, and a tested example script you can copy.'

export const Route = createFileRoute('/guide')({
  loader: async () => ({ user: await getSession(), highlights: await getGuideHighlights() }),
  head: () => ({
    meta: [
      { title: `${GUIDE_TITLE_BASE} | statuslin.es` },
      { name: 'description', content: DESCRIPTION },
      ...staticPageSocialMeta({
        path: '/guide',
        title: GUIDE_TITLE_BASE,
        description: DESCRIPTION,
      }),
    ],
    links: [canonicalLink('/guide')],
    scripts: [jsonLdScript(guideJsonLd(siteUrl()))],
  }),
  component: Guide,
})

function Guide() {
  const { user, highlights } = Route.useLoaderData()
  return (
    <PageShell user={user}>
      <GuideContent highlights={highlights} />
    </PageShell>
  )
}
