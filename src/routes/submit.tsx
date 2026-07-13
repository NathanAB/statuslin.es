import { createFileRoute } from '@tanstack/react-router'
import { getSession } from '@/lib/auth-functions'
import { canonicalLink } from '@/lib/canonical'
import { staticPageSocialMeta } from '@/og/meta'
import { SubmitForm } from '@/submit/submit-form'
import { Stack } from '@/ui/layout'
import { PageShell } from '@/ui/shell'
import { SignInPrompt } from '@/ui/sign-in-prompt'
import { Heading, Text } from '@/ui/text'

const TITLE = 'Submit a status line'
const DESCRIPTION =
  'Submit your Claude Code status line to the community gallery. We render it in a sandbox across example sessions, review it, and publish it for others to copy.'

export const Route = createFileRoute('/submit')({
  loader: () => getSession(),
  head: () => ({
    meta: [
      { title: `${TITLE} — statuslin.es` },
      { name: 'description', content: DESCRIPTION },
      ...staticPageSocialMeta({ path: '/submit', title: TITLE, description: DESCRIPTION }),
    ],
    links: [canonicalLink('/submit')],
  }),
  component: Submit,
})

function Submit() {
  const user = Route.useLoaderData()

  if (!user) {
    return <SignInPrompt title="Sign in to submit a status line" />
  }

  return (
    <PageShell user={user} narrow>
      <Stack gap={4}>
        <Heading level={1}>Submit a status line</Heading>
        <Text muted size="sm" measure>
          Paste your script below. We'll run it in a sandbox across a range of example sessions,
          review it, and add it to the gallery.
        </Text>
        <SubmitForm user={user} />
      </Stack>
    </PageShell>
  )
}
