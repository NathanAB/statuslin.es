import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { canonicalLink } from '@/lib/canonical'
import { ModSubmitForm, modSubmitPageCopy } from '@/mods/mod-submit-form'
import { loadModSubmitPage } from '@/mods/submit-page'
import { staticPageSocialMeta } from '@/og/meta'
import { submitPageCopy } from '@/submit/submit-copy'
import { SubmitForm } from '@/submit/submit-form'
import { loadSubmitPage, validateSubmitSearch } from '@/submit/submit-page'
import { Stack } from '@/ui/layout'
import { SegmentedControl } from '@/ui/segmented-control'
import { PageShell } from '@/ui/shell'
import { SignInPrompt } from '@/ui/sign-in-prompt'
import { Heading, Text } from '@/ui/text'

const TITLE = 'Submit a status line'
const DESCRIPTION =
  'Submit your Claude Code status line to the community gallery. We render it in a sandbox across example sessions, review it, and publish it for others to copy.'

const KIND_OPTIONS = [
  { label: 'Status line', value: 'status_line' },
  { label: 'Mod', value: 'mod' },
] as const

export const Route = createFileRoute('/submit')({
  validateSearch: validateSubmitSearch,
  loaderDeps: ({ search }) => ({
    kind: search.kind,
    resubmit: search.resubmit,
    update: search.update,
  }),
  loader: async ({ deps }) =>
    deps.kind === 'mod'
      ? { kind: 'mod' as const, ...(await loadModSubmitPage(deps)) }
      : { kind: 'status_line' as const, ...(await loadSubmitPage(deps)) },
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
  const data = Route.useLoaderData()
  const navigate = useNavigate({ from: '/submit' })
  if (!data.user) {
    return (
      <SignInPrompt
        title={data.kind === 'mod' ? 'Sign in to submit a mod' : 'Sign in to submit a status line'}
      />
    )
  }

  const draft = data.kind === 'mod' ? data.draft : data.initial
  const copy = data.kind === 'mod' ? modSubmitPageCopy(data.draft) : submitPageCopy(data.initial)
  return (
    <PageShell user={data.user} narrow>
      <Stack gap={4}>
        <Heading level={1}>{copy.heading}</Heading>
        {draft ? null : (
          <SegmentedControl
            label="What are you submitting?"
            options={KIND_OPTIONS}
            value={data.kind}
            onValueChange={(kind) => navigate({ search: kind === 'mod' ? { kind: 'mod' } : {} })}
          />
        )}
        <Text muted size="sm">
          {copy.intro}
        </Text>
        {data.kind === 'mod' ? (
          <ModSubmitForm draft={data.draft} />
        ) : (
          <SubmitForm user={data.user} initial={data.initial} />
        )}
      </Stack>
    </PageShell>
  )
}
