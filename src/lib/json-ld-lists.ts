import { HOME_CRUMB_NAME } from '@/lib/breadcrumb-json-ld'

export function configListPageJsonLd(
  origin: string,
  page: { path: string; name: string },
  items: Array<{ slug: string; title: string }>,
  itemPath: (slug: string) => string = (slug) => `/c/${slug}`,
): object[] {
  const url = `${origin}${page.path}`
  return [
    {
      '@context': 'https://schema.org',
      '@type': 'CollectionPage',
      name: page.name,
      url,
      mainEntity: {
        '@type': 'ItemList',
        numberOfItems: items.length,
        itemListElement: items.map((item, i) => ({
          '@type': 'ListItem',
          position: i + 1,
          name: item.title,
          url: `${origin}${itemPath(item.slug)}`,
        })),
      },
    },
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: HOME_CRUMB_NAME, item: origin },
        { '@type': 'ListItem', position: 2, name: page.name, item: url },
      ],
    },
  ]
}
