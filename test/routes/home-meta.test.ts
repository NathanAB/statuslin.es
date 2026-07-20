import { describe, expect, it } from 'vitest'
import { Route as HomeRoute } from '@/routes/index'

describe('home search indexing metadata', () => {
  it('renders WebSite and CollectionPage as separate JSON-LD scripts', async () => {
    const head = await HomeRoute.options.head?.({
      loaderData: {
        gallery: {
          page: 1,
          cards: [{ slug: 'alpha', title: 'Alpha' }],
        },
      },
      match: { search: {} },
    } as never)

    const scripts = (head?.scripts ?? []) as Array<{ type: string; children: string }>
    expect(scripts).toHaveLength(2)
    expect(scripts.every((script) => script.type === 'application/ld+json')).toBe(true)
    expect(scripts.map((script) => JSON.parse(script.children)['@type'])).toEqual([
      'WebSite',
      'CollectionPage',
    ])
  })

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
