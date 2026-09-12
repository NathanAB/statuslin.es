import { describe, expect, it } from 'vitest'
import { buildTasqrCacheFixture, TASQR_API_HOST } from '@/render/tasqr-cache'

const NOW_MS = Date.UTC(2026, 8, 11, 19, 0, 0)

describe('buildTasqrCacheFixture', () => {
  it('writes a live-looking Tasqr snapshot when api.tasqr.ai is declared', () => {
    const file = buildTasqrCacheFixture([TASQR_API_HOST], NOW_MS)
    expect(file).not.toBeNull()
    expect(file?.path).toBe('/home/user/.cache/tasqr-statusline/cache.json')

    const cache = JSON.parse(file?.content ?? '{}') as {
      fetched_at: number
      active: Array<{ title: string; priority: number }>
      active_count: number
      next: { title: string; priority: number } | null
      pending_count: string
      blocked_count: string
    }
    expect(cache.fetched_at).toBe(NOW_MS / 1000)
    expect(cache.active[0]?.title).toBe('Fix lease reclaim')
    expect(cache.active_count).toBe(1)
    expect(cache.next?.title).toBe('Review quota invoices')
    expect(cache.pending_count).toBe('4')
    expect(cache.blocked_count).toBe('0')
  })

  it('returns null when Tasqr is not a declared host', () => {
    expect(buildTasqrCacheFixture([], NOW_MS)).toBeNull()
    expect(buildTasqrCacheFixture(['wttr.in'], NOW_MS)).toBeNull()
  })
})
