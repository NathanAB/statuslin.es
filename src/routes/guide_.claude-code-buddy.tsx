import { createFileRoute } from '@tanstack/react-router'
import { BUDDY_FAQ } from '@/guide/buddy-faq'
import { BuddyGuideContent } from '@/guide/buddy-guide-content'
import { getBuddyPetsFn } from '@/guide/functions'
import { getSession } from '@/lib/auth-functions'
import { canonicalLink } from '@/lib/canonical'
import { guideJsonLd } from '@/lib/guide-json-ld'
import { jsonLdScript } from '@/lib/json-ld'
import {
  BUDDY_GUIDE_DATES,
  BUDDY_GUIDE_DESCRIPTION,
  BUDDY_GUIDE_PATH,
  BUDDY_GUIDE_TITLE,
} from '@/lib/page-title'
import { siteUrl } from '@/lib/site'
import { staticPageSocialMeta } from '@/og/meta'
import { PageShell } from '@/ui/shell'

// `guide_` keeps this page out of the /guide route's layout: it's a sibling page, not a child.
export const Route = createFileRoute('/guide_/claude-code-buddy')({
  loader: async () => {
    const [user, pets] = await Promise.all([getSession(), getBuddyPetsFn()])
    return { user, pets, origin: siteUrl() }
  },
  head: () => ({
    meta: [
      { title: BUDDY_GUIDE_TITLE },
      { name: 'description', content: BUDDY_GUIDE_DESCRIPTION },
      ...staticPageSocialMeta({
        path: BUDDY_GUIDE_PATH,
        title: BUDDY_GUIDE_TITLE,
        description: BUDDY_GUIDE_DESCRIPTION,
      }),
    ],
    links: [canonicalLink(BUDDY_GUIDE_PATH)],
    scripts: guideJsonLd(
      siteUrl(),
      {
        path: BUDDY_GUIDE_PATH,
        headline: BUDDY_GUIDE_TITLE,
        description: BUDDY_GUIDE_DESCRIPTION,
        dates: BUDDY_GUIDE_DATES,
      },
      BUDDY_FAQ,
    ).map(jsonLdScript),
  }),
  component: BuddyGuide,
})

function BuddyGuide() {
  const { user, pets, origin } = Route.useLoaderData()
  return (
    <PageShell user={user}>
      <BuddyGuideContent pets={pets} origin={origin} />
    </PageShell>
  )
}
