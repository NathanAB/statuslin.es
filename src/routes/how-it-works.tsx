import { createFileRoute } from '@tanstack/react-router'
import { getHowItWorksExamplesFn } from '@/how-it-works/functions'
import { HowItWorksContent } from '@/how-it-works/how-it-works-content'
import { getSession } from '@/lib/auth-functions'
import { canonicalLink } from '@/lib/canonical'
import { guideJsonLd } from '@/lib/guide-json-ld'
import { jsonLdScript } from '@/lib/json-ld'
import {
  HOW_IT_WORKS_DATES,
  HOW_IT_WORKS_DESCRIPTION,
  HOW_IT_WORKS_PATH,
  HOW_IT_WORKS_TITLE,
} from '@/lib/page-title'
import { siteUrl } from '@/lib/site'
import { staticPageSocialMeta } from '@/og/meta'
import { PageShell } from '@/ui/shell'

export const Route = createFileRoute('/how-it-works')({
  loader: async () => {
    const [user, examples] = await Promise.all([getSession(), getHowItWorksExamplesFn()])
    return { user, examples }
  },
  head: () => ({
    meta: [
      { title: HOW_IT_WORKS_TITLE },
      { name: 'description', content: HOW_IT_WORKS_DESCRIPTION },
      ...staticPageSocialMeta({
        path: HOW_IT_WORKS_PATH,
        title: HOW_IT_WORKS_TITLE,
        description: HOW_IT_WORKS_DESCRIPTION,
      }),
    ],
    links: [canonicalLink(HOW_IT_WORKS_PATH)],
    scripts: guideJsonLd(siteUrl(), {
      path: HOW_IT_WORKS_PATH,
      headline: HOW_IT_WORKS_TITLE,
      description: HOW_IT_WORKS_DESCRIPTION,
      dates: HOW_IT_WORKS_DATES,
    }).map(jsonLdScript),
  }),
  component: HowItWorks,
})

function HowItWorks() {
  const { user, examples } = Route.useLoaderData()
  return (
    <PageShell user={user}>
      <HowItWorksContent examples={examples} />
    </PageShell>
  )
}
