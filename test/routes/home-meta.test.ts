import { afterEach, describe, expect, it } from 'vitest'
import { PAGE_SIZE } from '@/gallery/queries'
import { Route as HomeRoute } from '@/routes/index'

/** A loader entry: a gallery item and the text a search matches it on. */
const entry = (kind: string, slug: string, title: string, searchText = slug) => ({
  item: { kind, card: { slug, title } },
  searchText,
})
const filler = (count: number) =>
  Array.from({ length: count }, (_, i) => entry('status-line', `filler-${i}`, `Filler ${i}`))

const ORIGINAL_URL = process.env.BETTER_AUTH_URL
afterEach(() => {
  process.env.BETTER_AUTH_URL = ORIGINAL_URL
})

describe('home search indexing metadata', () => {
  it('gives page 1 the base gallery title and description', async () => {
    const head = await HomeRoute.options.head?.({
      loaderData: { entries: filler(3 * PAGE_SIZE) },
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

  it('gives page 2 distinct metadata', async () => {
    process.env.BETTER_AUTH_URL = 'https://statuslin.es'
    const head = await HomeRoute.options.head?.({
      loaderData: { entries: filler(3 * PAGE_SIZE) },
      match: { search: { page: 2 } },
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
      loaderData: { entries: [entry('status-line', 'alpha', 'Alpha')] },
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
        entries: [
          ...filler(PAGE_SIZE),
          entry('mod', 'meter', 'Meter'),
          entry('status-line', 'alpha', 'Alpha'),
        ],
      },
      match: { search: { page: 2 } },
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

  it('canonicalizes a kind-filtered gallery to itself and marks it noindex', async () => {
    process.env.BETTER_AUTH_URL = 'https://statuslin.es'
    const head = await HomeRoute.options.head?.({
      loaderData: { entries: [] },
      match: { search: { kind: 'mods' } },
    } as never)

    expect(head?.meta).toContainEqual({ name: 'robots', content: 'noindex, follow' })
    expect(head?.links).toEqual([{ rel: 'canonical', href: 'https://statuslin.es/?kind=mods' }])
  })

  it('keeps the kind in the canonical of a later kind-filtered page', async () => {
    process.env.BETTER_AUTH_URL = 'https://statuslin.es'
    const head = await HomeRoute.options.head?.({
      loaderData: { entries: filler(PAGE_SIZE + 1) },
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
      loaderData: { entries: filler(3 * PAGE_SIZE) },
      match: { search: { sort: 'new', page: 2 } },
    } as never)

    const scripts = (head?.scripts ?? []) as Array<{ children: string }>
    expect(scripts.map((script) => JSON.parse(script.children)['@type'])).toEqual([
      'WebSite',
      'Organization',
    ])
  })

  it('marks a search noindex, leaves it out of the canonical and omits CollectionPage', async () => {
    process.env.BETTER_AUTH_URL = 'https://statuslin.es'
    const head = await HomeRoute.options.head?.({
      loaderData: { entries: [entry('status-line', 'alpha', 'Alpha'), ...filler(3)] },
      match: { search: { q: 'alpha' } },
    } as never)

    expect(head?.meta).toContainEqual({ name: 'robots', content: 'noindex, follow' })
    expect(head?.links).toEqual([{ rel: 'canonical', href: 'https://statuslin.es' }])
    const scripts = (head?.scripts ?? []) as Array<{ children: string }>
    expect(scripts.map((script) => JSON.parse(script.children)['@type'])).toEqual([
      'WebSite',
      'Organization',
    ])
  })

  it('pages the matches of a search, showing their last page for a page past it', async () => {
    process.env.BETTER_AUTH_URL = 'https://statuslin.es'
    const matching = Array.from({ length: PAGE_SIZE + 1 }, (_, i) =>
      entry('status-line', `weather-${i}`, `Weather ${i}`),
    )
    const head = await HomeRoute.options.head?.({
      loaderData: { entries: [...filler(3 * PAGE_SIZE), ...matching] },
      match: { search: { q: 'weather', page: 3 } },
    } as never)

    expect(head?.meta).toContainEqual({ title: 'Claude Code Mods — Page 2 | statuslin.es' })
    expect(head?.links).toEqual([{ rel: 'canonical', href: 'https://statuslin.es/?page=2' }])
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
