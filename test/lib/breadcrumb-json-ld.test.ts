import { describe, expect, it } from 'vitest'
import { breadcrumbJsonLd, modJsonLd } from '@/lib/breadcrumb-json-ld'

describe('breadcrumbJsonLd', () => {
  it('numbers the crumbs from 1, home first', () => {
    expect(
      breadcrumbJsonLd([
        { name: 'Status lines', item: 'https://statuslin.es' },
        { name: 'Solo', item: 'https://statuslin.es/c/solo' },
      ]),
    ).toEqual({
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Status lines', item: 'https://statuslin.es' },
        { '@type': 'ListItem', position: 2, name: 'Solo', item: 'https://statuslin.es/c/solo' },
      ],
    })
  })
})

describe('modJsonLd', () => {
  it('breadcrumbs from home through the mods page to the mod', () => {
    expect(modJsonLd('https://statuslin.es', { slug: 'filetree', title: 'File Tree' })).toEqual([
      {
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Status lines', item: 'https://statuslin.es' },
          {
            '@type': 'ListItem',
            position: 2,
            name: 'Mods',
            item: 'https://statuslin.es/mods',
          },
          {
            '@type': 'ListItem',
            position: 3,
            name: 'File Tree',
            item: 'https://statuslin.es/mods/filetree',
          },
        ],
      },
    ])
  })
})
