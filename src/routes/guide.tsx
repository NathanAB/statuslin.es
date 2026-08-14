import { createFileRoute } from '@tanstack/react-router'
import { getGuideHighlights } from '@/guide/functions'
import { GuideContent } from '@/guide/guide-content'
import { getSession } from '@/lib/auth-functions'
import { canonicalLink } from '@/lib/canonical'
import { guideJsonLd, jsonLdScript } from '@/lib/json-ld'
import { GUIDE_DESCRIPTION, GUIDE_TITLE_BASE } from '@/lib/page-title'
import { siteUrl } from '@/lib/site'
import { staticPageSocialMeta } from '@/og/meta'
import { PageShell } from '@/ui/shell'

export const Route = createFileRoute('/guide')({
  loader: async () => ({ user: await getSession(), highlights: await getGuideHighlights() }),
  head: () => ({
    meta: [
      { title: `${GUIDE_TITLE_BASE} | statuslin.es` },
      { name: 'description', content: GUIDE_DESCRIPTION },
      ...staticPageSocialMeta({
        path: '/guide',
        title: GUIDE_TITLE_BASE,
        description: GUIDE_DESCRIPTION,
      }),
    ],
    links: [canonicalLink('/guide')],
    scripts: guideJsonLd(siteUrl(), GUIDE_DESCRIPTION).map(jsonLdScript),
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
