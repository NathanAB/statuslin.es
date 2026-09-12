// biome-ignore-all lint/style/useNamingConvention: keys mirror Tasqr Queue's cache JSON contract.

/** Sandbox snapshot of Tasqr's local cache, so gallery previews show a working queue
 *  instead of the missing-key nagger. Gated on the declared host: only configs that
 *  talk to Tasqr get the file. Path and JSON shape match Tasqr Queue's render path
 *  (`~/.cache/tasqr-statusline/cache.json`, `active` / `next` / counts / `fetched_at`). */

export const TASQR_API_HOST = 'api.tasqr.ai'
export const TASQR_CACHE_PATH = '/home/user/.cache/tasqr-statusline/cache.json'

export function buildTasqrCacheFixture(
  networkHosts: string[],
  nowMs = Date.now(),
): { path: string; content: string } | null {
  if (!networkHosts.includes(TASQR_API_HOST)) return null
  return {
    path: TASQR_CACHE_PATH,
    content: JSON.stringify({
      fetched_at: nowMs / 1000,
      tags: [],
      active: [{ title: 'Fix lease reclaim', priority: 3 }],
      active_count: 1,
      next: { title: 'Review quota invoices', priority: 3 },
      pending_count: '4',
      blocked_count: '0',
    }),
  }
}
