import { createFileRoute } from '@tanstack/react-router'
import { DesktopGuideContent } from '@/guide/desktop-guide-content'
import { getSession } from '@/lib/auth-functions'
import { canonicalLink } from '@/lib/canonical'
import { desktopGuideJsonLd } from '@/lib/desktop-guide-json-ld'
import { jsonLdScript } from '@/lib/json-ld'
import {
  DESKTOP_GUIDE_DESCRIPTION,
  DESKTOP_GUIDE_PATH,
  DESKTOP_GUIDE_TITLE_BASE,
} from '@/lib/page-title'
import { siteUrl } from '@/lib/site'
import { staticPageSocialMeta } from '@/og/meta'
import { PageShell } from '@/ui/shell'

// `guide_` keeps this page out of the /guide route's layout: it's a sibling page, not a child.
export const Route = createFileRoute('/guide_/claude-desktop')({
  loader: async () => ({ user: await getSession() }),
  head: () => ({
    meta: [
      { title: `${DESKTOP_GUIDE_TITLE_BASE} | statuslin.es` },
      { name: 'description', content: DESKTOP_GUIDE_DESCRIPTION },
      ...staticPageSocialMeta({
        path: DESKTOP_GUIDE_PATH,
        title: DESKTOP_GUIDE_TITLE_BASE,
        description: DESKTOP_GUIDE_DESCRIPTION,
      }),
    ],
    links: [canonicalLink(DESKTOP_GUIDE_PATH)],
    scripts: desktopGuideJsonLd(siteUrl(), DESKTOP_GUIDE_DESCRIPTION).map(jsonLdScript),
  }),
  component: DesktopGuide,
})

function DesktopGuide() {
  const { user } = Route.useLoaderData()
  return (
    <PageShell user={user}>
      <DesktopGuideContent />
    </PageShell>
  )
}
