import { and, asc, desc, eq, sql } from 'drizzle-orm'
import type { PgDatabase } from 'drizzle-orm/pg-core'
import { type GeneratedContent, generatedContentSchema } from '@/content/types'
import {
  type ModFootprint,
  modCopyEvents,
  modDesktopPreviews,
  modPreviews,
  mods,
  modVersions,
} from '@/db/schema'
import { modDesktopPreviewPath } from '@/lib/site'
import { isUuid } from '@/lib/uuid'
import type { AnsiSegment } from '@/render/types'
import type { DesktopShotImage } from '@/ui/desktop-shot'
import type { MarketplaceModRow } from './marketplace'

// biome-ignore lint/suspicious/noExplicitAny: db type varies by driver (postgres-js/pglite); query surface identical.
type Db = PgDatabase<any, typeof import('@/db/schema')>

export const MOD_SCENARIO_KEY = 'clean-main'

/**
 * A `mod_versions` row counts as rendered once both surfaces have a result for its scenario: a
 * terminal preview and a Desktop result, either of which may be that the mod drew nothing there.
 */
export const versionIsRendered = sql`(exists (select 1 from ${modPreviews} where ${modPreviews.modVersionId} = ${modVersions.id} and ${modPreviews.scenarioKey} = ${MOD_SCENARIO_KEY}) and exists (select 1 from ${modDesktopPreviews} where ${modDesktopPreviews.modVersionId} = ${modVersions.id} and ${modDesktopPreviews.scenarioKey} = ${MOD_SCENARIO_KEY}))`

/** Joins a version's clean-main terminal preview. */
export const terminalPreviewJoin = and(
  eq(modPreviews.modVersionId, modVersions.id),
  eq(modPreviews.scenarioKey, MOD_SCENARIO_KEY),
)

/** Joins a version's clean-main Desktop result. */
export const desktopPreviewJoin = and(
  eq(modDesktopPreviews.modVersionId, modVersions.id),
  eq(modDesktopPreviews.scenarioKey, MOD_SCENARIO_KEY),
)

/** A version's Claude Desktop result: a shot to show, or that the mod drew nothing there. */
export type DesktopPreview = { kind: 'shot'; shot: DesktopShotImage } | { kind: 'nothing' }

/** What `desktopPreview` reads. Never the PNG, which only the image route sends. */
export const desktopPreviewColumns = {
  versionId: modDesktopPreviews.modVersionId,
  kind: modDesktopPreviews.kind,
  width: modDesktopPreviews.width,
  height: modDesktopPreviews.height,
  cardAnchor: modDesktopPreviews.cardAnchor,
}

type Nullable<T> = { [K in keyof T]: T[K] | null }
type DesktopPreviewRow = Nullable<
  Pick<typeof modDesktopPreviews.$inferSelect, 'kind' | 'width' | 'height' | 'cardAnchor'> & {
    versionId: string
  }
>

/** The left-joined `desktopPreviewColumns`, or null when the version has no Desktop result yet. */
export function desktopPreview(row: DesktopPreviewRow | null): DesktopPreview | null {
  if (row?.kind === 'nothing') return { kind: 'nothing' }
  const { versionId, width, height, cardAnchor } = row ?? {}
  // The table's check constraint gives every shot a size and an anchor.
  if (row?.kind !== 'shot' || !versionId || !width || !height || !cardAnchor) return null
  return {
    kind: 'shot',
    shot: { src: modDesktopPreviewPath(versionId), width, height, cardAnchor },
  }
}

export async function getMarketplaceRows(db: Db): Promise<MarketplaceModRow[]> {
  return db
    .select({
      slug: mods.slug,
      pluginName: mods.pluginName,
      description: mods.description,
      authorGithub: mods.authorGithub,
      tags: mods.tags,
      repoUrl: modVersions.repoUrl,
      path: modVersions.path,
      commitSha: modVersions.commitSha,
      license: modVersions.license,
    })
    .from(mods)
    .innerJoin(
      modVersions,
      and(eq(modVersions.id, mods.currentVersionId), eq(modVersions.modId, mods.id)),
    )
    .where(eq(mods.status, 'published'))
    .orderBy(asc(mods.pluginName))
}

export interface PublishedModListing {
  slug: string
  title: string
  description: string
  copyCount: number
  updatedAt: Date
}

/** `updatedAt` is the date of the mod's current version. */
export async function getPublishedModListings(db: Db): Promise<PublishedModListing[]> {
  return db
    .select({
      slug: mods.slug,
      title: mods.title,
      description: mods.description,
      copyCount: mods.copyCount,
      updatedAt: modVersions.createdAt,
    })
    .from(mods)
    .innerJoin(
      modVersions,
      and(eq(modVersions.id, mods.currentVersionId), eq(modVersions.modId, mods.id)),
    )
    .where(eq(mods.status, 'published'))
    .orderBy(desc(mods.copyCount), asc(mods.slug))
}

/** True when the `mods` table has a row in any status, published or not. */
export async function hasAnyMods(db: Db): Promise<boolean> {
  const [row] = await db.select({ id: mods.id }).from(mods).limit(1)
  return row !== undefined
}

export interface ModDetail {
  id: string
  slug: string
  pluginName: string
  title: string
  description: string
  authorGithub: string
  repoUrl: string
  path: string
  commitSha: string
  license: string | null
  footprint: ModFootprint
  /** The terminal preview: null before it renders, empty when the mod drew nothing there. */
  preview: AnsiSegment[] | null
  /** Null before it renders. */
  desktop: DesktopPreview | null
  generatedContent: GeneratedContent | null
}

/** A published mod by slug with its own current version, or null (draft, removed, unknown). */
export async function getModDetail(db: Db, slug: string): Promise<ModDetail | null> {
  const [row] = await db
    .select({
      id: mods.id,
      slug: mods.slug,
      pluginName: mods.pluginName,
      title: mods.title,
      description: mods.description,
      authorGithub: mods.authorGithub,
      repoUrl: modVersions.repoUrl,
      path: modVersions.path,
      commitSha: modVersions.commitSha,
      license: modVersions.license,
      footprint: modVersions.footprint,
      preview: modPreviews.segments,
      desktop: desktopPreviewColumns,
      generatedContent: modVersions.generatedContent,
    })
    .from(mods)
    .innerJoin(
      modVersions,
      and(eq(modVersions.id, mods.currentVersionId), eq(modVersions.modId, mods.id)),
    )
    .leftJoin(modPreviews, terminalPreviewJoin)
    .leftJoin(modDesktopPreviews, desktopPreviewJoin)
    .where(and(eq(mods.slug, slug), eq(mods.status, 'published')))
  if (!row) return null
  const content = generatedContentSchema.safeParse(row.generatedContent)
  return {
    ...row,
    desktop: desktopPreview(row.desktop),
    generatedContent: content.success ? content.data : null,
  }
}

/**
 * Count a copy of a published mod's install command, at most once per `ipHash` per mod, the way
 * `recordCopy` counts config copies. Returns the current count; 0 for a malformed id or a mod that
 * is missing or not published. A null `ipHash` (no trustworthy client IP) counts nothing.
 */
export async function recordModCopy(db: Db, modId: string, ipHash: string | null): Promise<number> {
  if (!isUuid(modId)) return 0
  return db.transaction(async (tx) => {
    const [mod] = await tx
      .select({ copyCount: mods.copyCount })
      .from(mods)
      .where(and(eq(mods.id, modId), eq(mods.status, 'published')))
    if (!mod) return 0
    if (ipHash === null) return mod.copyCount
    const inserted = await tx
      .insert(modCopyEvents)
      .values({ modId, ipHash })
      .onConflictDoNothing()
      .returning({ id: modCopyEvents.id })
    if (inserted.length === 0) return mod.copyCount
    const [updated] = await tx
      .update(mods)
      .set({ copyCount: sql`${mods.copyCount} + 1` })
      .where(eq(mods.id, modId))
      .returning({ copyCount: mods.copyCount })
    return updated?.copyCount ?? mod.copyCount + 1
  })
}
