import { and, asc, eq, exists, inArray, not, type SQL, sql } from 'drizzle-orm'
import { alias, type PgDatabase } from 'drizzle-orm/pg-core'
import z from 'zod'
import { modPageCopySchema, readPageCopy } from '@/content/types'
import { modDesktopPreviews, modPreviews, mods, modVersions, submissions } from '@/db/schema'
import { TAG_VOCABULARY } from '@/gallery/facets'
import { buildModContentPrompt, buildModTagsPrompt } from './content-prompt'
import { describeModFootprint } from './footprint'
import { footprintFacts } from './footprint-facts'
import { modAllTags } from './publish'
import { desktopPreviewJoin, terminalPreviewJoin } from './queries'

// biome-ignore lint/suspicious/noExplicitAny: db type varies by driver (postgres-js/pglite); query surface identical.
type Db = PgDatabase<any, typeof import('@/db/schema')>

/** 2: the page copy format (summary, howItWorks, goodToKnow, details). */
export const MOD_CONTENT_SCHEMA_VERSION = 2 as const

/** The README at `path` in `repoUrl` at `commitSha`, or null when the folder has none. */
export type ModReadmeSource = (
  repoUrl: string,
  path: string,
  commitSha: string,
) => Promise<string | null>

export interface ModContentGenerationRequest {
  schemaVersion: typeof MOD_CONTENT_SCHEMA_VERSION
  kind: 'mod'
  slug: string
  versionId: string
  commitSha: string
  contentPrompt: string
  tagsPrompt: string
}

const TAGS = new Set(TAG_VOCABULARY)

const modContentResponseSchema = z.object({
  schemaVersion: z.literal(MOD_CONTENT_SCHEMA_VERSION),
  kind: z.literal('mod'),
  slug: z.string().min(1),
  versionId: z.string().min(1),
  commitSha: z.string().min(1),
  generatedContent: modPageCopySchema,
  tags: z
    .array(
      z
        .string()
        .refine((tag) => TAGS.has(tag), { error: (issue) => `unknown tag "${issue.input}"` }),
    )
    .transform((tags) => [...new Set(tags)]),
})

export type ModContentGenerationResponse = z.infer<typeof modContentResponseSchema>

const currentVersion = eq(modVersions.id, mods.currentVersionId)

const submittedVersion = alias(modVersions, 'submitted_version')

/**
 * A submitted mod still in review: a draft with a submission (curated drafts have none). Its
 * current version is its first, which a fix replaces, so its copy is written once it is approved.
 */
function inReview(db: Db): SQL {
  const submitted = exists(
    db
      .select({ id: submissions.id })
      .from(submissions)
      .innerJoin(submittedVersion, eq(submittedVersion.id, submissions.modVersionId))
      .where(eq(submittedVersion.modId, mods.id)),
  )
  return sql`(${eq(mods.status, 'draft')} and ${submitted})`
}

export async function prepareModContentGenerationRequest(
  db: Db,
  slug: string,
  readReadme: ModReadmeSource,
): Promise<ModContentGenerationRequest> {
  const [row] = await db
    .select({
      mod: mods,
      version: modVersions,
      preview: modPreviews.segments,
      desktop: modDesktopPreviews.kind,
    })
    .from(mods)
    .innerJoin(modVersions, currentVersion)
    .leftJoin(modPreviews, terminalPreviewJoin)
    .leftJoin(modDesktopPreviews, desktopPreviewJoin)
    .where(eq(mods.slug, slug))
  if (!row) throw new Error(`no mod found with slug "${slug}"`)
  const { mod, version, preview, desktop } = row
  const [waiting] = await db
    .select({ id: mods.id })
    .from(mods)
    .where(and(eq(mods.id, mod.id), inReview(db)))
  if (waiting) {
    throw new Error(`mod "${slug}" is still in review: generate its copy after it is approved`)
  }

  const described = describeModFootprint({
    footprint: version.footprint,
    preview,
    desktop: desktop ? { kind: desktop } : null,
  })
  const readme = await readReadme(version.repoUrl, version.path, version.commitSha)
  const pin = { slug, versionId: version.id, commitSha: version.commitSha }
  const list = (items: string[]) => (items.length > 0 ? items.join(', ') : 'nothing listed')
  const untrusted = [
    `Title: ${mod.title}`,
    `Plugin name: ${mod.pluginName}`,
    `Description: ${mod.description || 'none'}`,
    `What the plugin validator says it does (command and tool names are the author's): ${list(described.phrases)}`,
    `Validator entries statuslin.es does not recognize, as written: ${list(described.unknown)}`,
    '',
    'Preview (what it drew in a sample session):',
    preview?.map((s) => s.text).join('') ||
      (preview ? 'It drew nothing in the terminal.' : 'No terminal preview is available.'),
    '',
    'README at the pinned commit:',
    readme ?? 'This mod has no README.',
  ].join('\n')
  const checks = { described, facts: footprintFacts(version.footprint) }
  return {
    schemaVersion: MOD_CONTENT_SCHEMA_VERSION,
    kind: 'mod',
    ...pin,
    contentPrompt: buildModContentPrompt(pin, untrusted, checks),
    tagsPrompt: buildModTagsPrompt(pin, untrusted),
  }
}

/** Published mods and curated drafts whose current version has no page copy in the current format. */
export async function listModSlugsMissingContent(db: Db): Promise<string[]> {
  const rows = await db
    .select({ slug: mods.slug, generatedContent: modVersions.generatedContent })
    .from(mods)
    .innerJoin(modVersions, currentVersion)
    .where(and(inArray(mods.status, ['draft', 'published']), not(inReview(db))))
    .orderBy(asc(mods.createdAt), asc(mods.slug))
  return rows
    .filter((row) => readPageCopy(modPageCopySchema, row.generatedContent) === null)
    .map((row) => row.slug)
}

export function parseModContentGenerationResponses(raw: string): ModContentGenerationResponse[] {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch (error) {
    throw new Error(
      `mod content response is not valid JSON: ${error instanceof Error ? error.message : error}`,
    )
  }
  const result = z
    .array(modContentResponseSchema)
    .min(1)
    .safeParse(Array.isArray(parsed) ? parsed : [parsed])
  if (!result.success) {
    throw new Error(`mod content response failed validation:\n${z.prettifyError(result.error)}`)
  }
  const slugs = new Set<string>()
  for (const response of result.data) {
    if (slugs.has(response.slug)) {
      throw new Error(`duplicate mod content response for slug "${response.slug}"`)
    }
    slugs.add(response.slug)
  }
  return result.data
}

/**
 * Writes every response or none: a response for any version but the current one, or for a mod
 * still in review, aborts the batch.
 */
export async function applyModContentGenerationResponses(
  db: Db,
  responses: ModContentGenerationResponse[],
): Promise<void> {
  await db.transaction(async (tx) => {
    for (const response of responses) {
      const [row] = await tx
        .select({ modId: mods.id, footprint: modVersions.footprint })
        .from(mods)
        .innerJoin(modVersions, currentVersion)
        .where(
          and(
            eq(mods.slug, response.slug),
            eq(modVersions.id, response.versionId),
            eq(modVersions.commitSha, response.commitSha),
            not(inReview(tx)),
          ),
        )
      if (!row) {
        throw new Error(
          `mod "${response.slug}" is in review or at a different version than the response (changed after its request was prepared)`,
        )
      }
      await tx
        .update(modVersions)
        .set({ generatedContent: response.generatedContent })
        .where(eq(modVersions.id, response.versionId))
      const [updated] = await tx
        .update(mods)
        .set({ tags: response.tags, allTags: modAllTags(response.tags, row.footprint) })
        .where(and(eq(mods.id, row.modId), eq(mods.currentVersionId, response.versionId)))
        .returning({ id: mods.id })
      if (!updated) throw new Error(`mod "${response.slug}" changed while applying its content`)
    }
  })
}
