import { createFileRoute, notFound } from '@tanstack/react-router'
import { CompareContent } from '@/compare/compare-content'
import { getComparePage } from '@/compare/functions'
import { comparePageHead } from '@/compare/head'
import { getSession } from '@/lib/auth-functions'
import { PageShell } from '@/ui/shell'
import { Text, TextLink } from '@/ui/text'

export const Route = createFileRoute('/compare/$pair')({
  loader: async ({ params }) => {
    const page = await getComparePage({ data: { path: `/compare/${params.pair}` } })
    if (!page) throw notFound()
    return { page, user: await getSession() }
  },
  head: ({ loaderData }) => comparePageHead(loaderData?.page),
  notFoundComponent: () => (
    <PageShell user={null}>
      <Text>No comparison here yet.</Text>
      <TextLink to="/resources">See status line tools</TextLink>
    </PageShell>
  ),
  component: ComparisonPage,
})

function ComparisonPage() {
  const { page, user } = Route.useLoaderData()
  return (
    <PageShell user={user}>
      <CompareContent page={page} />
    </PageShell>
  )
}
