import { HttpError } from '@/lib/http'
import { PLUGIN_NAME } from './curation'

/**
 * What the mod submit form sends, checked on both sides of the wire. This module runs in the
 * browser too, so it imports nothing server-only: the server function only strips what its
 * handler alone uses.
 */
export const MOD_TITLE_MAX = 200
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
