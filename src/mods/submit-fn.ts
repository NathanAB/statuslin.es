import { createServerFn } from '@tanstack/react-start'
import { getRequestHeaders } from '@tanstack/react-start/server'
import { db } from '@/db'
import { auth } from '@/lib/auth'
import { HttpError } from '@/lib/http'
import { withHttpStatus } from '@/lib/http.server'
import { captureServerEvent } from '@/lib/posthog-server'
import { withModSandbox } from '@/render/mods/mod-sandbox'
import { PLUGIN_NAME } from './curation'
import { createGitHub } from './github'
import { getOwnModDraft } from './own-mod'
import { MOD_TITLE_MAX, submitMod } from './submit'
import { modSubmitGuard } from './submit-guard'
import { modSubmittedEvent } from './submitted-event'

const DRAFT_KINDS = ['update', 'resubmission'] as const
const LINK_MAX = 500
/** A plugin name is at most 100 characters; `-<owner>` adds at most 40. */
const MOD_SLUG_MAX = 141

interface ModSubmitRequest {
  link: string
  title?: string
  slug?: string
}

function optionalString(value: unknown, max: number, what: string): string | undefined {
  if (value === undefined) return undefined
  if (typeof value !== 'string' || value.length > max) throw new HttpError(400, `invalid ${what}`)
  return value
}

export function validateModSubmitRequest(data: Record<string, unknown>): ModSubmitRequest {
  const link = optionalString(data.link, LINK_MAX, 'link')
  if (!link?.trim()) throw new HttpError(400, 'Paste a GitHub link to the mod.')
  const slug = optionalString(data.slug, MOD_SLUG_MAX, 'mod')
  if (slug !== undefined && !PLUGIN_NAME.test(slug)) throw new HttpError(400, 'invalid mod')
  // Twice the stored cap, so surrounding spaces still reach submitMod to be trimmed.
  const title = optionalString(data.title, MOD_TITLE_MAX * 2, 'title')
  return {
    link,
    ...(title === undefined ? {} : { title }),
    ...(slug === undefined ? {} : { slug }),
  }
}

export const submitModFn = createServerFn({ method: 'POST' })
  .inputValidator(validateModSubmitRequest)
  .handler(({ data }) =>
    withHttpStatus(async () => {
      const session = await auth.api.getSession({ headers: getRequestHeaders() })
      if (!session?.user) throw new HttpError(401, 'must be signed in to submit')
      // A client per request: it keeps every download it makes for its own lifetime.
      const result = await submitMod(
        db,
        { ...data, submittedBy: session.user.id },
        { github: createGitHub(), withSandbox: withModSandbox, guard: modSubmitGuard },
      )
      const event = modSubmittedEvent({
        userId: session.user.id,
        slug: result.slug,
        modId: result.modId,
        versionId: result.versionId,
        isUpdate: result.isUpdate,
      })
      // Fail-soft, so a telemetry hiccup never fails a submission that already landed.
      captureServerEvent(event.event, event.distinctId, event.properties)
      return result
    }),
  )

export const getModDraftFn = createServerFn({ method: 'GET' })
  .inputValidator((data: { slug: unknown; kind: unknown }) => {
    if (typeof data.slug !== 'string' || !PLUGIN_NAME.test(data.slug)) {
      throw new HttpError(400, 'invalid mod')
    }
    const kind = DRAFT_KINDS.find((k) => k === data.kind)
    if (!kind) throw new HttpError(400, 'invalid draft')
    return { slug: data.slug, kind }
  })
  .handler(({ data }) =>
    withHttpStatus(async () => {
      const session = await auth.api.getSession({ headers: getRequestHeaders() })
      if (!session?.user) throw new HttpError(401, 'must be signed in to submit')
      return getOwnModDraft(db, data.slug, data.kind, session.user.id)
    }),
  )
