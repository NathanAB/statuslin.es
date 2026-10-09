import { getTableName, type SQL, sql } from 'drizzle-orm'
import type { PgColumn } from 'drizzle-orm/pg-core'
import { copyEvents } from '@/db/schema'

export const TRENDING_HALF_LIFE_SECONDS = 7 * 24 * 60 * 60

export interface CopyEventColumns {
  ownerId: PgColumn
  createdAt: PgColumn
}

export const CONFIG_COPY_EVENTS: CopyEventColumns = {
  ownerId: copyEvents.configId,
  createdAt: copyEvents.createdAt,
}

function qualified(column: PgColumn): SQL {
  return sql`${sql.identifier(getTableName(column.table))}.${sql.identifier(column.name)}`
}

/**
 * Sum time-decayed, deduplicated copies for one row, so a config copy and a mod copy of the same
 * age weigh the same. Submission time never enters the score.
 */
export function trendingScore(ownerId: PgColumn, events: CopyEventColumns): SQL<number> {
  const eventCreatedAt = qualified(events.createdAt)
  const eventOwnerId = qualified(events.ownerId)
  const outerOwnerId = qualified(ownerId)
  return sql<number>`coalesce((
    select sum(
      power(
        0.5,
        extract(epoch from (now() - ${eventCreatedAt})) / ${TRENDING_HALF_LIFE_SECONDS}
      )
    )
    from ${events.ownerId.table}
    where ${eventOwnerId} = ${outerOwnerId}
  ), 0)`
}
