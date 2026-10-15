import { createFileRoute } from '@tanstack/react-router'
import { ModSafetyContent } from '@/guide/mod-safety-content'
import { MOD_SAFETY_FAQ } from '@/guide/mod-safety-faq'
import { getSession } from '@/lib/auth-functions'
import { canonicalLink } from '@/lib/canonical'
import { guideJsonLd } from '@/lib/guide-json-ld'
import { jsonLdScript } from '@/lib/json-ld'
import {
  MOD_SAFETY_GUIDE_DATES,
  MOD_SAFETY_GUIDE_DESCRIPTION,
  MOD_SAFETY_GUIDE_PATH,
  MOD_SAFETY_GUIDE_TITLE,
} from '@/lib/page-title'
import { siteUrl } from '@/lib/site'
import { staticPageSocialMeta } from '@/og/meta'
import { PageShell } from '@/ui/shell'

// `guide_` keeps this page out of the /guide route's layout: it's a sibling page, not a child.
export const Route = createFileRoute('/guide_/are-claude-code-mods-safe')({
  loader: async () => ({ user: await getSession() }),
  head: () => ({
    meta: [
      { title: MOD_SAFETY_GUIDE_TITLE },
      { name: 'description', content: MOD_SAFETY_GUIDE_DESCRIPTION },
      ...staticPageSocialMeta({
        path: MOD_SAFETY_GUIDE_PATH,
        title: MOD_SAFETY_GUIDE_TITLE,
        description: MOD_SAFETY_GUIDE_DESCRIPTION,
      }),
    ],
    links: [canonicalLink(MOD_SAFETY_GUIDE_PATH)],
    scripts: guideJsonLd(
      siteUrl(),
      {
        path: MOD_SAFETY_GUIDE_PATH,
        headline: MOD_SAFETY_GUIDE_TITLE,
        description: MOD_SAFETY_GUIDE_DESCRIPTION,
        dates: MOD_SAFETY_GUIDE_DATES,
      },
      MOD_SAFETY_FAQ,
    ).map(jsonLdScript),
  }),
  component: ModSafetyGuide,
})

function ModSafetyGuide() {
  const { user } = Route.useLoaderData()
  return (
    <PageShell user={user}>
      <ModSafetyContent />
    </PageShell>
  )
}
