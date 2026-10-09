import { inArray } from 'drizzle-orm'
import type { PgDatabase } from 'drizzle-orm/pg-core'
import { configVersions } from '@/db/schema'

// biome-ignore lint/suspicious/noExplicitAny: db type varies by driver (postgres-js/pglite); query surface identical.
type Db = PgDatabase<any, typeof import('@/db/schema')>

/** The fields of a config's live version that a reviewer compares an update against. */
export interface LiveVersion {
  title: string
  description: string
  interpreter: string
  source: string
  networkHosts: string[]
}

/** Live versions by id, fetched in one query. */
export async function getLiveVersions(
  database: Db,
  ids: string[],
): Promise<Map<string, LiveVersion>> {
  if (ids.length === 0) return new Map()
  const rows = await database
    .select({
      id: configVersions.id,
      title: configVersions.title,
      description: configVersions.description,
      interpreter: configVersions.interpreter,
      source: configVersions.source,
      networkHosts: configVersions.networkHosts,
    })
    .from(configVersions)
    .where(inArray(configVersions.id, ids))
  return new Map(
    rows.map(({ id, networkHosts, ...rest }) => [
      id,
      { ...rest, networkHosts: networkHosts ?? [] },
    ]),
  )
}
