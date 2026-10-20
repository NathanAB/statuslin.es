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
        { title: 'Claude Code Mods | statuslin.es' },
        {
          name: 'description',
          content:
            'Claude Code mods with real previews. Install any of them with one copied prompt.',
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
        { title: 'Claude Code Mods — Page 2 | statuslin.es' },
        {
          name: 'description',
          content:
            'Claude Code mods with real previews. Install any of them with one copied prompt. Page 2 of 3.',
        },
        { property: 'og:url', content: 'https://statuslin.es/?page=2' },
        { property: 'og:title', content: 'Claude Code Mods — Page 2' },
        {
          property: 'og:description',
          content:
            'Claude Code mods with real previews. Install any of them with one copied prompt. Page 2 of 3.',
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
      name: 'Claude Code Mods — Page 2',
      url: 'https://statuslin.es/?page=2',
    })
  })

  it('renders WebSite, Organization and CollectionPage as separate JSON-LD scripts', async () => {
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
    expect(scripts).toHaveLength(3)
    expect(scripts.every((script) => script.type === 'application/ld+json')).toBe(true)
    expect(scripts.map((script) => JSON.parse(script.children)['@type'])).toEqual([
      'WebSite',
      'Organization',
      'CollectionPage',
    ])
  })

  it('lists the mod and status line cards in the CollectionPage in the order the page shows them', async () => {
    process.env.BETTER_AUTH_URL = 'https://statuslin.es'
    const head = await HomeRoute.options.head?.({
      loaderData: {
        gallery: {
          page: 2,
          pageCount: 2,
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
      | { mainEntity: { itemListElement: Array<{ position: number; url: string }> } }
      | undefined
    expect(
      collectionPage?.mainEntity.itemListElement.map(({ position, url }) => ({ position, url })),
    ).toEqual([
      { position: 11, url: 'https://statuslin.es/mods/meter' },
      { position: 12, url: 'https://statuslin.es/c/alpha' },
    ])
  })

  // The ItemList is the ranked gallery, numbered across pages. The "Featured mod" row is a separate
  // section whose mod also ranks in the gallery, so listing it would shift page 1's numbering and
  // list that mod twice.
  it('lists only the ranked gallery in the CollectionPage, not the "Featured mod" row', async () => {
    process.env.BETTER_AUTH_URL = 'https://statuslin.es'
    const head = await HomeRoute.options.head?.({
      loaderData: {
        gallery: {
          page: 1,
          pageCount: 2,
          items: [{ kind: 'status-line', card: { slug: 'alpha', title: 'Alpha' } }],
        },
        featuredMod: { slug: 'meter', title: 'Meter' },
      },
      match: { search: {} },
    } as never)

    const collectionPage = ((head?.scripts ?? []) as Array<{ children: string }>)
      .map((script) => JSON.parse(script.children) as Record<string, unknown>)
      .find((node) => node['@type'] === 'CollectionPage') as
      | { mainEntity: { itemListElement: Array<{ position: number; url: string }> } }
      | undefined
    expect(
      collectionPage?.mainEntity.itemListElement.map(({ position, url }) => ({ position, url })),
    ).toEqual([{ position: 1, url: 'https://statuslin.es/c/alpha' }])
  })

  it('canonicalizes a kind-filtered gallery to itself and marks it noindex', async () => {
    process.env.BETTER_AUTH_URL = 'https://statuslin.es'
    const head = await HomeRoute.options.head?.({
      loaderData: { gallery: { page: 1, pageCount: 1, items: [] } },
      match: { search: { kind: 'mods' } },
    } as never)

    expect(head?.meta).toContainEqual({ name: 'robots', content: 'noindex, follow' })
    expect(head?.links).toEqual([{ rel: 'canonical', href: 'https://statuslin.es/?kind=mods' }])
  })

  it('keeps the kind in the canonical of a later kind-filtered page', async () => {
    process.env.BETTER_AUTH_URL = 'https://statuslin.es'
    const head = await HomeRoute.options.head?.({
      loaderData: { gallery: { page: 2, pageCount: 2, items: [] } },
      match: { search: { kind: 'mods', page: 2 } },
    } as never)

    expect(head?.meta).toContainEqual({ name: 'robots', content: 'noindex, follow' })
    expect(head?.links).toEqual([
      { rel: 'canonical', href: 'https://statuslin.es/?kind=mods&page=2' },
    ])
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
    expect(scripts.map((script) => JSON.parse(script.children)['@type'])).toEqual([
      'WebSite',
      'Organization',
    ])
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
