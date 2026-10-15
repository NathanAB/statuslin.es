import { getSession } from '@/lib/auth-functions'
import type { ModDraft } from './own-mod'
import { getModDraftFn } from './submit-fn'

/** The draft a /submit?kind=mod link names: a fix to a rejected mod, or an update to a published one. */
export async function loadModSubmitPage(search: {
  resubmit?: string | undefined
  update?: string | undefined
}): Promise<{ user: Awaited<ReturnType<typeof getSession>>; draft: ModDraft | null }> {
  const user = await getSession()
  if (!user) return { user: null, draft: null }
  if (search.resubmit) {
    return {
      user,
      draft: await getModDraftFn({ data: { slug: search.resubmit, kind: 'resubmission' } }),
    }
  }
  if (search.update) {
    return { user, draft: await getModDraftFn({ data: { slug: search.update, kind: 'update' } }) }
  }
  return { user, draft: null }
}
