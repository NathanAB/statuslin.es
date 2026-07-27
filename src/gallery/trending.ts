import { getTableName, type SQL, sql } from 'drizzle-orm'
import type { PgColumn } from 'drizzle-orm/pg-core'
import { copyEvents } from '@/db/schema'

export const TRENDING_HALF_LIFE_SECONDS = 7 * 24 * 60 * 60

function qualified(column: PgColumn): SQL {
  return sql`${sql.identifier(getTableName(column.table))}.${sql.identifier(column.name)}`
}

/** Sum time-decayed, deduplicated copies for one config. Submission time never enters the score. */
export function trendingScore(configId: PgColumn): SQL<number> {
  const eventCreatedAt = qualified(copyEvents.createdAt)
  const eventConfigId = qualified(copyEvents.configId)
  const outerConfigId = qualified(configId)
  return sql<number>`coalesce((
    select sum(
      power(
        0.5,
        extract(epoch from (now() - ${eventCreatedAt})) / ${TRENDING_HALF_LIFE_SECONDS}
      )
    )
    from ${copyEvents}
    where ${eventConfigId} = ${outerConfigId}
  ), 0)`
}
