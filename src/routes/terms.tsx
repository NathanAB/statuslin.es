import { createFileRoute } from '@tanstack/react-router'
import { TermsContent } from '@/legal/terms'
import { getSession } from '@/lib/auth-functions'
import { canonicalLink } from '@/lib/canonical'
import { PageShell } from '@/ui/shell'

export const Route = createFileRoute('/terms')({
  loader: () => getSession(),
  head: () => ({
    meta: [{ title: 'Terms — statuslin.es' }],
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
