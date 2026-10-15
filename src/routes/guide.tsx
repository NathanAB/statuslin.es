import { createFileRoute } from '@tanstack/react-router'
import { getGuideHighlights } from '@/guide/functions'
import { GuideContent } from '@/guide/guide-content'
import { GUIDE_FAQ } from '@/guide/guide-faq'
import { getSession } from '@/lib/auth-functions'
import { canonicalLink } from '@/lib/canonical'
import { guideJsonLd } from '@/lib/guide-json-ld'
import { jsonLdScript } from '@/lib/json-ld'
import { GUIDE_DATES, GUIDE_DESCRIPTION, GUIDE_PATH, GUIDE_TITLE_BASE } from '@/lib/page-title'
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
        path: GUIDE_PATH,
        title: GUIDE_TITLE_BASE,
        description: GUIDE_DESCRIPTION,
      }),
    ],
    links: [canonicalLink(GUIDE_PATH)],
    scripts: guideJsonLd(
      siteUrl(),
      {
        path: GUIDE_PATH,
        headline: GUIDE_TITLE_BASE,
        description: GUIDE_DESCRIPTION,
        dates: GUIDE_DATES,
      },
      GUIDE_FAQ,
    ).map(jsonLdScript),
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
