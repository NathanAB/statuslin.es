import { usePostHog } from '@posthog/react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { canonicalLink } from '@/lib/canonical'
import { ModSubmitForm, modSubmitPageCopy } from '@/mods/mod-submit-form'
import { loadModSubmitPage } from '@/mods/submit-page'
import { staticPageSocialMeta } from '@/og/meta'
import { submitPageCopy } from '@/submit/submit-copy'
import { SubmitForm } from '@/submit/submit-form'
import { loadSubmitPage, validateSubmitSearch } from '@/submit/submit-page'
import { Row, Stack } from '@/ui/layout'
import { SegmentedControl } from '@/ui/segmented-control'
import { PageShell } from '@/ui/shell'
import { SignInPrompt } from '@/ui/sign-in-prompt'
import { Heading, Text } from '@/ui/text'

const STATUS_LINE_PAGE = {
  title: 'Submit a status line',
  description:
    'Submit your Claude Code status line to the community gallery. We render it in a sandbox across example sessions, review it, and publish it for others to copy.',
}
const MOD_PAGE = {
  title: 'Submit a mod',
  description:
    'Submit a Claude Code mod to the community gallery by its GitHub link. We pin it to a commit, render it in a sandbox, review it, and list it for others to install.',
}

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
  head: ({ loaderData }) => {
    const { title, description } = loaderData?.kind === 'mod' ? MOD_PAGE : STATUS_LINE_PAGE
    return {
      meta: [
        { title: `${title} — statuslin.es` },
        { name: 'description', content: description },
        { name: 'robots', content: 'noindex, follow' },
        ...staticPageSocialMeta({ path: '/submit', title, description }),
      ],
      links: [canonicalLink('/submit')],
    }
  },
  component: Submit,
})

function Submit() {
  const data = Route.useLoaderData()
  const navigate = useNavigate({ from: '/submit' })
  const posthog = usePostHog()
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
          // A Row, so the control keeps its own width instead of stretching across the column.
          <Row gap={2}>
            <SegmentedControl
              label="What are you submitting?"
              options={KIND_OPTIONS}
              value={data.kind}
              onValueChange={(kind) => {
                posthog.capture('submit_kind_changed', { kind, previousKind: data.kind })
                navigate({ search: kind === 'mod' ? { kind: 'mod' } : {} })
              }}
            />
          </Row>
        )}
        <Text muted size="sm">
          {copy.intro}
        </Text>
        {data.kind === 'mod' ? (
          <ModSubmitForm
            key={data.draft ? `${data.draft.kind}:${data.draft.slug}` : 'new'}
            draft={data.draft}
          />
        ) : (
          <SubmitForm user={data.user} initial={data.initial} />
        )}
      </Stack>
    </PageShell>
  )
}
