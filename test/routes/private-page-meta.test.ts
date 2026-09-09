import { describe, expect, it } from 'vitest'
import { Route as AdminRoute } from '@/routes/admin/index'
import { Route as MeRoute } from '@/routes/me'
import { Route as SubmitRoute } from '@/routes/submit'

describe('private page indexing metadata', () => {
  it('marks /me as noindex', async () => {
    const head = await MeRoute.options.head?.({} as never)

    expect(head?.meta).toContainEqual({ name: 'robots', content: 'noindex, follow' })
  })

  it('marks /admin as noindex', async () => {
    const head = await AdminRoute.options.head?.({} as never)

    expect(head?.meta).toContainEqual({ name: 'robots', content: 'noindex, follow' })
  })

  it('marks /submit as noindex while keeping links followable', async () => {
    const head = await SubmitRoute.options.head?.({} as never)

    expect(head?.meta).toContainEqual({ name: 'robots', content: 'noindex, follow' })
  })
})
