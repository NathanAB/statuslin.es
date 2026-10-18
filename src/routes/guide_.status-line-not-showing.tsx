import { createFileRoute } from '@tanstack/react-router'
import { StatusLineNotShowingContent } from '@/guide/status-line-not-showing-content'
import { NOT_SHOWING_FAQ } from '@/guide/status-line-not-showing-faq'
import { getSession } from '@/lib/auth-functions'
import { canonicalLink } from '@/lib/canonical'
import { guideJsonLd } from '@/lib/guide-json-ld'
import { jsonLdScript } from '@/lib/json-ld'
import {
  NOT_SHOWING_GUIDE_DATES,
  NOT_SHOWING_GUIDE_DESCRIPTION,
  NOT_SHOWING_GUIDE_PATH,
  NOT_SHOWING_GUIDE_TITLE,
} from '@/lib/page-title'
import { siteUrl } from '@/lib/site'
import { staticPageSocialMeta } from '@/og/meta'
import { PageShell } from '@/ui/shell'

// `guide_` keeps this page out of the /guide route's layout: it's a sibling page, not a child.
export const Route = createFileRoute('/guide_/status-line-not-showing')({
  loader: async () => ({ user: await getSession() }),
  head: () => ({
    meta: [
      { title: NOT_SHOWING_GUIDE_TITLE },
      { name: 'description', content: NOT_SHOWING_GUIDE_DESCRIPTION },
      ...staticPageSocialMeta({
        path: NOT_SHOWING_GUIDE_PATH,
        title: NOT_SHOWING_GUIDE_TITLE,
        description: NOT_SHOWING_GUIDE_DESCRIPTION,
      }),
    ],
    links: [canonicalLink(NOT_SHOWING_GUIDE_PATH)],
    scripts: guideJsonLd(
      siteUrl(),
      {
        path: NOT_SHOWING_GUIDE_PATH,
        headline: NOT_SHOWING_GUIDE_TITLE,
        description: NOT_SHOWING_GUIDE_DESCRIPTION,
        dates: NOT_SHOWING_GUIDE_DATES,
      },
      NOT_SHOWING_FAQ,
    ).map(jsonLdScript),
  }),
  component: StatusLineNotShowingGuide,
})

function StatusLineNotShowingGuide() {
  const { user } = Route.useLoaderData()
  return (
    <PageShell user={user}>
      <StatusLineNotShowingContent />
    </PageShell>
  )
}
