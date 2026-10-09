import { and, asc, eq, sql } from 'drizzle-orm'
import type { PgDatabase } from 'drizzle-orm/pg-core'
import { modPreviews, mods, modVersions } from '@/db/schema'
import type { MarketplaceModRow } from './marketplace'

// biome-ignore lint/suspicious/noExplicitAny: db type varies by driver (postgres-js/pglite); query surface identical.
type Db = PgDatabase<any, typeof import('@/db/schema')>

export const MOD_SCENARIO_KEY = 'clean-main'

/** A `mod_versions` row counts as rendered when it has its scenario preview or a Desktop screenshot. */
export const versionIsRendered = sql`(${modVersions.desktopScreenshot} is not null or exists (select 1 from ${modPreviews} where ${modPreviews.modVersionId} = ${modVersions.id} and ${modPreviews.scenarioKey} = ${MOD_SCENARIO_KEY}))`

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
    .innerJoin(modVersions, eq(modVersions.id, mods.currentVersionId))
    .where(and(eq(mods.status, 'published'), versionIsRendered))
    .orderBy(asc(mods.pluginName))
}
