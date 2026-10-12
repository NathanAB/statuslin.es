import { getSession } from '@/lib/auth-functions'
import type { SubmitDraft } from '@/submit/submit'
import { getResubmissionDraftFn, getUpdateDraftFn } from '@/submit/submit-fn'

export interface SubmitSearch {
  /** `mod` picks the mod form; a status line is the default. */
  kind?: 'mod' | undefined
  resubmit?: string | undefined
  update?: string | undefined
}

function searchSlug(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

export function validateSubmitSearch(search: Record<string, unknown>): SubmitSearch {
  const kind = search.kind === 'mod' ? { kind: 'mod' as const } : {}
  const resubmit = searchSlug(search.resubmit)
  if (resubmit) return { ...kind, resubmit }
  const update = searchSlug(search.update)
  return update ? { ...kind, update } : kind
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
