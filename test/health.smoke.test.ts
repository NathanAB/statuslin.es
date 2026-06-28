import { describe, expect, it } from 'vitest'
import { healthHandler } from '@/routes/api/health'

describe('GET /api/health', () => {
  it('returns 200 {ok:true}', async () => {
    const res = await healthHandler()
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
  })
})
