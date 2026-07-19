import { describe, expect, it } from 'vitest'
import { Route as HomeRoute } from '@/routes/index'

describe('home search indexing metadata', () => {
  it('marks filtered gallery views noindex while keeping links followable', async () => {
    const head = await HomeRoute.options.head?.({
      loaderData: undefined,
      match: { search: { tags: 'git' } },
    } as never)

    expect(head?.meta).toContainEqual({ name: 'robots', content: 'noindex, follow' })
  })

  it('does not noindex the unfiltered gallery', async () => {
    const head = await HomeRoute.options.head?.({
      loaderData: undefined,
      match: { search: {} },
    } as never)

    expect(head?.meta).not.toContainEqual({ name: 'robots', content: 'noindex, follow' })
  })
})
