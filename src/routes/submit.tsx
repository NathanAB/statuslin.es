import { createFileRoute } from '@tanstack/react-router'
import { canonicalLink } from '@/lib/canonical'
import { staticPageSocialMeta } from '@/og/meta'
import { submitPageCopy } from '@/submit/submit-copy'
import { SubmitForm } from '@/submit/submit-form'
import { loadSubmitPage, validateSubmitSearch } from '@/submit/submit-page'
import { Stack } from '@/ui/layout'
import { PageShell } from '@/ui/shell'
import { SignInPrompt } from '@/ui/sign-in-prompt'
import { Heading, Text } from '@/ui/text'

const TITLE = 'Submit a status line'
const DESCRIPTION =
  'Submit your Claude Code status line to the community gallery. We render it in a sandbox across example sessions, review it, and publish it for others to copy.'

export const Route = createFileRoute('/submit')({
  validateSearch: validateSubmitSearch,
  loaderDeps: ({ search }) => ({ resubmit: search.resubmit, update: search.update }),
  loader: ({ deps }) => loadSubmitPage(deps),
  head: () => ({
    meta: [
      { title: `${TITLE} — statuslin.es` },
      { name: 'description', content: DESCRIPTION },
      { name: 'robots', content: 'noindex, follow' },
      ...staticPageSocialMeta({ path: '/submit', title: TITLE, description: DESCRIPTION }),
    ],
    links: [canonicalLink('/submit')],
  }),
  component: Submit,
})

function Submit() {
  const { user, initial } = Route.useLoaderData()
  const copy = submitPageCopy(initial)

  if (!user) {
    return <SignInPrompt title="Sign in to submit a status line" />
  }

  return (
    <PageShell user={user} narrow>
      <Stack gap={4}>
        <Heading level={1}>{copy.heading}</Heading>
        <Text muted size="sm" measure>
          {copy.intro}
        </Text>
        <SubmitForm user={user} initial={initial} />
      </Stack>
    </PageShell>
  )
}
