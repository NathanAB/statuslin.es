import { createFileRoute } from '@tanstack/react-router'
import { StatusLinesVsModsContent } from '@/guide/status-lines-vs-mods-content'
import { STATUS_LINES_VS_MODS_FAQ } from '@/guide/status-lines-vs-mods-faq'
import { getSession } from '@/lib/auth-functions'
import { canonicalLink } from '@/lib/canonical'
import { guideJsonLd } from '@/lib/guide-json-ld'
import { jsonLdScript } from '@/lib/json-ld'
import {
  STATUS_LINES_VS_MODS_GUIDE_DATES,
  STATUS_LINES_VS_MODS_GUIDE_DESCRIPTION,
  STATUS_LINES_VS_MODS_GUIDE_PATH,
  STATUS_LINES_VS_MODS_GUIDE_TITLE,
} from '@/lib/page-title'
import { siteUrl } from '@/lib/site'
import { STATUSLINE_ANYWHERE_MOD_SLUG } from '@/lib/statusline-anywhere'
import { getModDesktopShotFn } from '@/mods/functions'
import { staticPageSocialMeta } from '@/og/meta'
import { PageShell } from '@/ui/shell'

// `guide_` keeps this page out of the /guide route's layout: it's a sibling page, not a child.
export const Route = createFileRoute('/guide_/status-lines-vs-mods')({
  loader: async () => {
    const [user, statuslineAnywhere] = await Promise.all([
      getSession(),
      getModDesktopShotFn({ data: { slug: STATUSLINE_ANYWHERE_MOD_SLUG } }),
    ])
    return { user, statuslineAnywhere }
  },
  head: () => ({
    meta: [
      { title: STATUS_LINES_VS_MODS_GUIDE_TITLE },
      { name: 'description', content: STATUS_LINES_VS_MODS_GUIDE_DESCRIPTION },
      ...staticPageSocialMeta({
        path: STATUS_LINES_VS_MODS_GUIDE_PATH,
        title: STATUS_LINES_VS_MODS_GUIDE_TITLE,
        description: STATUS_LINES_VS_MODS_GUIDE_DESCRIPTION,
      }),
    ],
    links: [canonicalLink(STATUS_LINES_VS_MODS_GUIDE_PATH)],
    scripts: guideJsonLd(
      siteUrl(),
      {
        path: STATUS_LINES_VS_MODS_GUIDE_PATH,
        headline: STATUS_LINES_VS_MODS_GUIDE_TITLE,
        description: STATUS_LINES_VS_MODS_GUIDE_DESCRIPTION,
        dates: STATUS_LINES_VS_MODS_GUIDE_DATES,
      },
      STATUS_LINES_VS_MODS_FAQ,
    ).map(jsonLdScript),
  }),
  component: StatusLinesVsModsGuide,
})

function StatusLinesVsModsGuide() {
  const { user, statuslineAnywhere } = Route.useLoaderData()
  return (
    <PageShell user={user}>
      <StatusLinesVsModsContent statuslineAnywhere={statuslineAnywhere} />
    </PageShell>
  )
}
