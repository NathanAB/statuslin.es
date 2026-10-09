import { createFileRoute } from '@tanstack/react-router'
import { getSession } from '@/lib/auth-functions'
import { canonicalLink } from '@/lib/canonical'
import { staticPageSocialMeta } from '@/og/meta'
import type { SubmitDraft } from '@/submit/submit'
import { submitPageCopy } from '@/submit/submit-copy'
import { getResubmissionDraftFn, getUpdateDraftFn } from '@/submit/submit-fn'
import { SubmitForm } from '@/submit/submit-form'
import { Stack } from '@/ui/layout'
import { PageShell } from '@/ui/shell'
import { SignInPrompt } from '@/ui/sign-in-prompt'
import { Heading, Text } from '@/ui/text'

const TITLE = 'Submit a status line'
const DESCRIPTION =
  'Submit your Claude Code status line to the community gallery. We render it in a sandbox across example sessions, review it, and publish it for others to copy.'

interface SubmitSearch {
  resubmit?: string | undefined
  update?: string | undefined
}

function searchSlug(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

export function validateSubmitSearch(search: Record<string, unknown>): SubmitSearch {
  const resubmit = searchSlug(search.resubmit)
  if (resubmit) return { resubmit }
  const update = searchSlug(search.update)
  return update ? { update } : {}
}

async function loadDraft({ resubmit, update }: SubmitSearch): Promise<SubmitDraft | null> {
  if (resubmit) return getResubmissionDraftFn({ data: { slug: resubmit } })
  if (update) return getUpdateDraftFn({ data: { slug: update } })
  return null
}

export async function loadSubmitPage(search: SubmitSearch) {
  const user = await getSession()
  if (!user) return { user: null, initial: null }
  return { user, initial: await loadDraft(search) }
}

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
