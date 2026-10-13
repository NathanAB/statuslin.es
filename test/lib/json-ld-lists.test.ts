import { describe, expect, it } from 'vitest'
import { configListPageJsonLd } from '@/lib/json-ld-lists'

describe('configListPageJsonLd', () => {
  it('builds a CollectionPage of ranked config URLs plus a breadcrumb', () => {
    const nodes = configListPageJsonLd(
      'https://statuslin.es',
      { path: '/status-lines/best', name: 'Best Claude Code Status Lines' },
      [
        { slug: 'a', title: 'A' },
        { slug: 'b', title: 'B' },
      ],
    )
    expect(nodes).toEqual([
      {
        '@context': 'https://schema.org',
        '@type': 'CollectionPage',
        name: 'Best Claude Code Status Lines',
        url: 'https://statuslin.es/status-lines/best',
        mainEntity: {
          '@type': 'ItemList',
          numberOfItems: 2,
          itemListElement: [
            { '@type': 'ListItem', position: 1, name: 'A', url: 'https://statuslin.es/c/a' },
            { '@type': 'ListItem', position: 2, name: 'B', url: 'https://statuslin.es/c/b' },
          ],
        },
      },
      {
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Status lines', item: 'https://statuslin.es' },
          {
            '@type': 'ListItem',
            position: 2,
            name: 'Best Claude Code Status Lines',
            item: 'https://statuslin.es/status-lines/best',
          },
        ],
      },
    ])
  })

  it('builds each item URL from the given path, for a list of mods', () => {
    const [collection] = configListPageJsonLd(
      'https://statuslin.es',
      { path: '/mods', name: 'Claude Code Mods' },
      [{ slug: 'meter', title: 'Meter' }],
      (slug) => `/mods/${slug}`,
    )

    expect(collection).toMatchObject({
      url: 'https://statuslin.es/mods',
      mainEntity: {
        itemListElement: [
          {
            '@type': 'ListItem',
            position: 1,
            name: 'Meter',
            url: 'https://statuslin.es/mods/meter',
          },
        ],
      },
    })
  })
})
