import { and, asc, eq, isNull } from 'drizzle-orm'
import type { PgDatabase } from 'drizzle-orm/pg-core'
import z from 'zod'
import { configs, configVersions } from '@/db/schema'
import { computeAllTags } from '@/lib/derived-tags'
import { getPreviews } from '@/render/store'
import { buildContentPrompt } from './prompt'
import { buildTagsPrompt, parseSuggestedTags } from './tags'
import { generatedContentSchema } from './types'

// biome-ignore lint/suspicious/noExplicitAny: db type varies by driver (postgres-js/pglite); query surface identical.
export type ContentGenerationDb = PgDatabase<any, typeof import('@/db/schema')>

export const CONTENT_GENERATION_SCHEMA_VERSION = 1 as const

export interface ContentGenerationRequest {
  schemaVersion: typeof CONTENT_GENERATION_SCHEMA_VERSION
  slug: string
  versionId: string
  contentSha256: string
  contentPrompt: string
  tagsPrompt: string
}

const contentGenerationResponseSchema = z.object({
  schemaVersion: z.literal(CONTENT_GENERATION_SCHEMA_VERSION),
  slug: z.string().min(1),
  versionId: z.string().min(1),
  contentSha256: z.string().min(1),
  generatedContent: generatedContentSchema,
  tags: z.array(z.string()),
})

export type ContentGenerationResponse = z.infer<typeof contentGenerationResponseSchema>

export async function prepareContentGenerationRequest(
  db: ContentGenerationDb,
  slug: string,
): Promise<ContentGenerationRequest> {
  const [row] = await db
    .select({ config: configs, version: configVersions })
    .from(configs)
    .innerJoin(configVersions, eq(configVersions.id, configs.currentVersionId))
    .where(eq(configs.slug, slug))
  if (!row) throw new Error(`no config found with slug "${slug}"`)

  const previews = await getPreviews(db, row.version.contentSha256)
  return {
    schemaVersion: CONTENT_GENERATION_SCHEMA_VERSION,
    slug,
    versionId: row.version.id,
    contentSha256: row.version.contentSha256,
    contentPrompt: buildContentPrompt({
      title: row.config.title,
      description: row.config.description,
      interpreter: row.version.interpreter,
      source: row.version.source,
      networkHosts: row.version.networkHosts ?? [],
      readsClaudeToken: row.version.readsClaudeToken ?? false,
      previews,
    }),
    tagsPrompt: buildTagsPrompt({
      title: row.config.title,
      description: row.config.description,
      source: row.version.source,
      previewLines: previews.map((preview) =>
        preview.segments.map((segment) => segment.text).join(''),
      ),
    }),
  }
}

export async function listPublishedSlugsMissingContent(db: ContentGenerationDb): Promise<string[]> {
  const rows = await db
    .select({ slug: configs.slug })
    .from(configs)
    .innerJoin(configVersions, eq(configVersions.id, configs.currentVersionId))
    .where(and(eq(configs.status, 'published'), isNull(configVersions.generatedContent)))
    .orderBy(asc(configs.createdAt))
  return rows.map((row) => row.slug)
}

export function parseContentGenerationResponses(raw: string): ContentGenerationResponse[] {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch (error) {
    throw new Error(
      `content generation response is not valid JSON: ${error instanceof Error ? error.message : error}`,
    )
  }
  const result = z
    .array(contentGenerationResponseSchema)
    .min(1)
    .safeParse(Array.isArray(parsed) ? parsed : [parsed])
  if (!result.success) {
    throw new Error(
      `content generation response failed validation:\n${z.prettifyError(result.error)}`,
    )
  }
  const slugs = new Set<string>()
  for (const response of result.data) {
    if (slugs.has(response.slug)) {
      throw new Error(`duplicate content generation response for slug "${response.slug}"`)
    }
    slugs.add(response.slug)
  }
  return result.data
}

export async function applyContentGenerationResponses(
  db: ContentGenerationDb,
  responses: ContentGenerationResponse[],
): Promise<void> {
  await db.transaction(async (tx) => {
    const prepared: Array<{
      configId: string
      response: ContentGenerationResponse
      tags: string[]
      allTags: string[]
    }> = []

    for (const response of responses) {
      const [row] = await tx
        .select({ config: configs, version: configVersions })
        .from(configs)
        .innerJoin(configVersions, eq(configVersions.id, configs.currentVersionId))
        .where(eq(configs.slug, response.slug))
      if (
        !row ||
        row.version.id !== response.versionId ||
        row.version.contentSha256 !== response.contentSha256
      ) {
        throw new Error(`config "${response.slug}" changed after its content request was prepared`)
      }
      const tags = parseSuggestedTags(JSON.stringify(response.tags))
      prepared.push({
        configId: row.config.id,
        response,
        tags,
        allTags: computeAllTags({
          curatedTags: tags,
          interpreter: row.version.interpreter,
          networkHosts: row.version.networkHosts ?? [],
          readsClaudeToken: row.version.readsClaudeToken ?? false,
        }),
      })
    }

    for (const item of prepared) {
      const [version] = await tx
        .update(configVersions)
        .set({ generatedContent: item.response.generatedContent })
        .where(
          and(
            eq(configVersions.id, item.response.versionId),
            eq(configVersions.contentSha256, item.response.contentSha256),
          ),
        )
        .returning({ id: configVersions.id })
      const [config] = await tx
        .update(configs)
        .set({ tags: item.tags, allTags: item.allTags })
        .where(
          and(eq(configs.id, item.configId), eq(configs.currentVersionId, item.response.versionId)),
        )
        .returning({ id: configs.id })
      if (!version || !config) {
        throw new Error(`config "${item.response.slug}" changed while applying generated content`)
      }
    }
  })
}
