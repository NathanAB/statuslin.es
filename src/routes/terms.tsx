import { createFileRoute } from '@tanstack/react-router'
import { TermsContent } from '@/legal/terms'
import { getSession } from '@/lib/auth-functions'
import { canonicalLink } from '@/lib/canonical'
import { staticPageSocialMeta } from '@/og/meta'
import { PageShell } from '@/ui/shell'

const TITLE = 'Terms'
const DESCRIPTION = 'Licensing and takedown terms for the mods on statuslin.es.'

export const Route = createFileRoute('/terms')({
  loader: () => getSession(),
  head: () => ({
    meta: [
      { title: `${TITLE} — statuslin.es` },
      { name: 'description', content: DESCRIPTION },
      ...staticPageSocialMeta({ path: '/terms', title: TITLE, description: DESCRIPTION }),
    ],
    links: [canonicalLink('/terms')],
  }),
  component: Terms,
})

function Terms() {
  const user = Route.useLoaderData()
  return (
    <PageShell user={user}>
      <TermsContent />
    </PageShell>
  )
}
