import { describe, expect, it } from 'vitest'
import { breadcrumbJsonLd } from '@/lib/breadcrumb-json-ld'

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
