import { createFileRoute } from '@tanstack/react-router'
import { DesktopGuideContent } from '@/guide/desktop-guide-content'
import { getSession } from '@/lib/auth-functions'
import { canonicalLink } from '@/lib/canonical'
import { guideJsonLd } from '@/lib/guide-json-ld'
import { jsonLdScript } from '@/lib/json-ld'
import {
  DESKTOP_GUIDE_DATES,
  DESKTOP_GUIDE_DESCRIPTION,
  DESKTOP_GUIDE_PATH,
  DESKTOP_GUIDE_TITLE_BASE,
} from '@/lib/page-title'
import { siteUrl } from '@/lib/site'
import { STATUSLINE_ANYWHERE_MOD_SLUG } from '@/lib/statusline-anywhere'
import { getModDesktopShotFn } from '@/mods/functions'
import { staticPageSocialMeta } from '@/og/meta'
import { PageShell } from '@/ui/shell'

// `guide_` keeps this page out of the /guide route's layout: it's a sibling page, not a child.
export const Route = createFileRoute('/guide_/claude-desktop')({
  loader: async () => {
    const [user, desktop] = await Promise.all([
      getSession(),
      getModDesktopShotFn({ data: { slug: STATUSLINE_ANYWHERE_MOD_SLUG } }),
    ])
    return { user, desktopShot: desktop.kind === 'shot' ? desktop.shot : null }
  },
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
    scripts: guideJsonLd(siteUrl(), {
      path: DESKTOP_GUIDE_PATH,
      headline: DESKTOP_GUIDE_TITLE_BASE,
      description: DESKTOP_GUIDE_DESCRIPTION,
      dates: DESKTOP_GUIDE_DATES,
    }).map(jsonLdScript),
  }),
  component: DesktopGuide,
})

function DesktopGuide() {
  const { user, desktopShot } = Route.useLoaderData()
  return (
    <PageShell user={user}>
      <DesktopGuideContent shot={desktopShot} />
    </PageShell>
  )
}
