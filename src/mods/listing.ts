import { and, eq } from 'drizzle-orm'
import type { PgDatabase } from 'drizzle-orm/pg-core'
import { mods, modVersions, submissions } from '@/db/schema'
import { HttpError } from '@/lib/http'
import { pickSlug } from './import'

// biome-ignore lint/suspicious/noExplicitAny: db type varies by driver (postgres-js/pglite); query surface identical.
type Db = PgDatabase<any, typeof import('@/db/schema')>

/**
 * The mod that holds this plugin folder, so a second listing of it is refused: a published or
 * removed mod, a curated draft, or a submission by `userId`. Another user's submission holds
 * nothing until it is approved, so submitting someone's folder first cannot lock its author out.
 */
export async function folderHolder(
  db: Db,
  folder: { repoUrl: string; path: string },
  { userId, exceptModId }: { userId?: string; exceptModId?: string },
) {
  const rows = await db
    .select({
      id: mods.id,
      slug: mods.slug,
      status: mods.status,
      submittedBy: submissions.submittedBy,
    })
    .from(modVersions)
    .innerJoin(mods, eq(mods.id, modVersions.modId))
    .leftJoin(submissions, eq(submissions.modVersionId, modVersions.id))
    .where(and(eq(modVersions.repoUrl, folder.repoUrl), eq(modVersions.path, folder.path)))
  return rows.find(
    (row) =>
      row.id !== exceptModId &&
      (row.status !== 'draft' || row.submittedBy === null || row.submittedBy === userId),
  )
}

interface DraftMod {
  id: string
  slug: string
  pluginName: string
  authorGithub: string
}

/**
 * The slug a draft publishes under: its marketplace entry name (ADR 0005). A submitted draft's slug
 * is provisional, so the name is picked as it is approved, among the mods that hold one. Refused
 * when a listed mod already holds the plugin's folder.
 */
export async function marketplaceName(
  db: Db,
  mod: DraftMod,
  folder: { repoUrl: string; path: string },
): Promise<string> {
  const holder = await folderHolder(db, folder, { exceptModId: mod.id })
  if (holder) throw new HttpError(409, `That plugin is already listed as "${holder.slug}".`)
  const named = [mod.pluginName, `${mod.pluginName}-${mod.authorGithub}`].includes(mod.slug)
  return named ? mod.slug : pickSlug(db, mod.pluginName, mod.authorGithub)
}
