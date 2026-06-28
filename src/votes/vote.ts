import { and, eq, sql } from 'drizzle-orm'
import type { PgDatabase } from 'drizzle-orm/pg-core'
import { configs, votes } from '@/db/schema'

// biome-ignore lint/suspicious/noExplicitAny: db type varies by driver (postgres-js/pglite); query surface identical.
type Db = PgDatabase<any, typeof import('@/db/schema')>

export interface VoteResult {
  voted: boolean
  count: number
}

/** Toggle a user's vote on a config and keep the denormalized count in sync, atomically. */
export async function toggleVote(db: Db, userId: string, configId: string): Promise<VoteResult> {
  return db.transaction(async (tx) => {
    const config = await tx
      .select({ status: configs.status })
      .from(configs)
      .where(eq(configs.id, configId))
    if (config.length === 0 || config[0]?.status !== 'published') {
      return { voted: false, count: 0 }
    }
    const existing = await tx
      .select()
      .from(votes)
      .where(and(eq(votes.userId, userId), eq(votes.configId, configId)))
    const hasVoted = existing.length > 0
    if (hasVoted) {
      await tx.delete(votes).where(and(eq(votes.userId, userId), eq(votes.configId, configId)))
    } else {
      await tx.insert(votes).values({ userId, configId })
    }
    const counted = await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(votes)
      .where(eq(votes.configId, configId))
    const count = counted[0]?.n ?? 0
    await tx.update(configs).set({ upvoteCount: count }).where(eq(configs.id, configId))
    return { voted: !hasVoted, count }
  })
}
