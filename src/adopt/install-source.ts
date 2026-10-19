import { and, eq } from 'drizzle-orm'
import type { PgDatabase } from 'drizzle-orm/pg-core'
import { configs, configVersions } from '@/db/schema'
import { isUuid } from '@/lib/uuid'
import { INTERPRETERS, type Interpreter } from '@/render/types'

// biome-ignore lint/suspicious/noExplicitAny: db type varies by driver (postgres-js/pglite); query surface identical.
type Db = PgDatabase<any, typeof import('@/db/schema')>

/** What an install prompt is built from: the live version's script, its interpreter and title. */
export interface InstallSource {
  title: string
  source: string
  interpreter: Interpreter
}

/**
 * The live script of a published status line, for a page that offers its install prompt without
 * carrying the script (the home hero). Null when the id is malformed, or the config is missing or
 * not published.
 */
export async function findInstallSource(db: Db, configId: string): Promise<InstallSource | null> {
  if (!isUuid(configId)) return null
  const [row] = await db
    .select({
      title: configVersions.title,
      source: configVersions.source,
      interpreter: configVersions.interpreter,
    })
    .from(configs)
    .innerJoin(configVersions, eq(configVersions.id, configs.currentVersionId))
    .where(and(eq(configs.id, configId), eq(configs.status, 'published')))
  if (!row) return null
  // The column is free-form text; anything unknown installs as bash, as the gallery shows it.
  const interpreter = INTERPRETERS.find((known) => known === row.interpreter) ?? 'bash'
  return { ...row, interpreter }
}
