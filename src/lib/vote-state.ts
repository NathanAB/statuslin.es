import { and, eq } from 'drizzle-orm'
import type { PgDatabase } from 'drizzle-orm/pg-core'
import { votes } from '@/db/schema'

// biome-ignore lint/suspicious/noExplicitAny: db type varies by driver (postgres-js/pglite); query surface identical.
type Db = PgDatabase<any, typeof import('@/db/schema')>

/** Whether a user has voted on a config — a shared read used across features. */
export async function getVoteState(db: Db, userId: string, configId: string): Promise<boolean> {
  const rows = await db
    .select()
    .from(votes)
    .where(and(eq(votes.userId, userId), eq(votes.configId, configId)))
  return rows.length > 0
}
