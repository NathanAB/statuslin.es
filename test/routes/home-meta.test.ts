import { afterEach, describe, expect, it } from 'vitest'
import { Route as HomeRoute } from '@/routes/index'

const ORIGINAL_URL = process.env.BETTER_AUTH_URL
afterEach(() => {
  process.env.BETTER_AUTH_URL = ORIGINAL_URL
})

describe('home search indexing metadata', () => {
  it('gives page 1 the base gallery title and description', async () => {
    const head = await HomeRoute.options.head?.({
      loaderData: {
        gallery: {
          page: 1,
          pageCount: 3,
          items: [],
        },
      },
      match: { search: {} },
    } as never)

    expect(head?.meta).toEqual(
      expect.arrayContaining([
        { title: 'Claude Code Status Lines | statuslin.es' },
        {
          name: 'description',
          content:
            'Browse a community gallery of Claude Code status lines. See real rendered previews and copy one in a single paste.',
        },
      ]),
    )
  })

  it('gives page 2 distinct metadata using the loader-clamped page values', async () => {
    process.env.BETTER_AUTH_URL = 'https://statuslin.es'
    const head = await HomeRoute.options.head?.({
      loaderData: {
        gallery: {
          page: 2,
          pageCount: 3,
          items: [],
        },
      },
      match: { search: { page: 999 } },
    } as never)

    expect(head?.meta).toEqual(
      expect.arrayContaining([
        { title: 'Claude Code Status Lines — Page 2 | statuslin.es' },
        {
          name: 'description',
          content:
            'Browse a community gallery of Claude Code status lines. See real rendered previews and copy one in a single paste. Page 2 of 3.',
        },
      ]),
    )
    expect(head?.links).toContainEqual({
      rel: 'canonical',
      href: 'https://statuslin.es/?page=2',
    })

    const scripts = (head?.scripts ?? []) as Array<{ children: string }>
    const collectionPage = scripts
      .map((script) => JSON.parse(script.children) as Record<string, unknown>)
      .find((node) => node['@type'] === 'CollectionPage')
    expect(collectionPage).toMatchObject({
      name: 'Claude Code Status Lines — Page 2',
      url: 'https://statuslin.es/?page=2',
    })
  })

  it('renders WebSite and CollectionPage as separate JSON-LD scripts', async () => {
    const head = await HomeRoute.options.head?.({
      loaderData: {
        gallery: {
          page: 1,
          pageCount: 1,
          items: [{ kind: 'status-line', card: { slug: 'alpha', title: 'Alpha' } }],
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

  it('lists only status lines in the CollectionPage, since its item URLs are config pages', async () => {
    process.env.BETTER_AUTH_URL = 'https://statuslin.es'
    const head = await HomeRoute.options.head?.({
      loaderData: {
        gallery: {
          page: 1,
          pageCount: 1,
          items: [
            { kind: 'mod', card: { slug: 'meter', title: 'Meter' } },
            { kind: 'status-line', card: { slug: 'alpha', title: 'Alpha' } },
          ],
        },
      },
      match: { search: {} },
    } as never)

    const collectionPage = ((head?.scripts ?? []) as Array<{ children: string }>)
      .map((script) => JSON.parse(script.children) as Record<string, unknown>)
      .find((node) => node['@type'] === 'CollectionPage') as
      | { mainEntity: { itemListElement: Array<{ url: string }> } }
      | undefined
    expect(collectionPage?.mainEntity.itemListElement.map((item) => item.url)).toEqual([
      'https://statuslin.es/c/alpha',
    ])
  })

  it('marks a kind-filtered gallery view noindex', async () => {
    const head = await HomeRoute.options.head?.({
      loaderData: undefined,
      match: { search: { kind: 'mods' } },
    } as never)

    expect(head?.meta).toContainEqual({ name: 'robots', content: 'noindex, follow' })
  })

  it('marks filtered gallery views noindex while keeping links followable', async () => {
    const head = await HomeRoute.options.head?.({
      loaderData: undefined,
      match: { search: { tags: 'git' } },
    } as never)

    expect(head?.meta).toContainEqual({ name: 'robots', content: 'noindex, follow' })
  })

  it('omits CollectionPage JSON-LD from filtered noindex views', async () => {
    const head = await HomeRoute.options.head?.({
      loaderData: {
        gallery: {
          page: 2,
          pageCount: 3,
          items: [{ kind: 'status-line', card: { slug: 'alpha', title: 'Alpha' } }],
        },
      },
      match: { search: { sort: 'new', page: 2 } },
    } as never)

    const scripts = (head?.scripts ?? []) as Array<{ children: string }>
    expect(scripts.map((script) => JSON.parse(script.children)['@type'])).toEqual(['WebSite'])
  })

  it('does not noindex the unfiltered gallery', async () => {
    const head = await HomeRoute.options.head?.({
      loaderData: undefined,
      match: { search: {} },
    } as never)

    expect(head?.meta).not.toContainEqual({ name: 'robots', content: 'noindex, follow' })
  })

  it('gives the out-of-range 404 view no canonical link or JSON-LD', async () => {
    const head = await HomeRoute.options.head?.({
      loaderData: undefined,
      match: { search: { page: 99 } },
    } as never)

    expect(head?.links).toEqual([])
    expect(head?.scripts).toEqual([])
  })
})
