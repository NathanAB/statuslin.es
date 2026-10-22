import { usePostHog } from '@posthog/react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useId } from 'react'
import { canonicalLink } from '@/lib/canonical'
import { ModSubmitForm, modSubmitPageCopy } from '@/mods/mod-submit-form'
import { loadModSubmitPage } from '@/mods/submit-page'
import { staticPageSocialMeta } from '@/og/meta'
import { submitNextSteps, submitPageCopy } from '@/submit/submit-copy'
import { SubmitForm } from '@/submit/submit-form'
import { loadSubmitPage, validateSubmitSearch } from '@/submit/submit-page'
import { ChoiceGroup } from '@/ui/choice-group'
import { FormLayout } from '@/ui/form-layout'
import { Stack } from '@/ui/layout'
import { NumberedList } from '@/ui/numbered-list'
import { PageShell } from '@/ui/shell'
import { SignInPrompt } from '@/ui/sign-in-prompt'
import { Heading, Text } from '@/ui/text'

// /submit opens on the status line form and asks which kind first, so its description names both
// kinds. Its title says "mod", the word the site uses for both.
const SUBMIT_PAGE = {
  title: 'Submit a mod',
  description:
    'Share a Claude Code mod or status line. We review every submission before it goes live.',
}
const MOD_PAGE = {
  title: 'Submit a mod',
  description: 'Share a Claude Code mod by its GitHub link. We review it before it goes live.',
}

// Each kind described, so the choice reads as a choice and the difference is clear at a glance.
const KIND_OPTIONS = [
  {
    label: 'Status line',
    value: 'status_line',
    detail: 'A script that prints the row under your Claude Code prompt. You paste its source.',
  },
  {
    label: 'Mod',
    value: 'mod',
    detail: 'A Claude Code plugin on GitHub that changes more than that row. You paste its link.',
  },
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
    const { title, description } = loaderData?.kind === 'mod' ? MOD_PAGE : SUBMIT_PAGE
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
  const kindId = useId()
  if (!data.user) {
    return (
      <SignInPrompt
        title={`Sign in to submit ${data.kind === 'mod' ? 'a mod' : 'a status line'}`}
      />
    )
  }

  const draft = data.kind === 'mod' ? data.draft : data.initial
  const copy = data.kind === 'mod' ? modSubmitPageCopy(data.draft) : submitPageCopy(data.initial)
  return (
    <PageShell user={data.user}>
      <FormLayout
        asideTitle="What happens next"
        aside={<NumberedList items={submitNextSteps(data.kind, draft?.kind === 'update')} />}
      >
        <Stack gap={4}>
          <Heading level={1}>{copy.heading}</Heading>
          {draft ? null : (
            <Stack gap={3}>
              <Heading level={2} size="compact" id={kindId}>
                What are you submitting?
              </Heading>
              <ChoiceGroup
                look="cards"
                labelledBy={kindId}
                options={KIND_OPTIONS}
                value={data.kind}
                onValueChange={(kind) => {
                  posthog.capture('submit_kind_changed', { kind, previousKind: data.kind })
                  navigate({ search: kind === 'mod' ? { kind: 'mod' } : {} })
                }}
              />
            </Stack>
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
      </FormLayout>
    </PageShell>
  )
}
