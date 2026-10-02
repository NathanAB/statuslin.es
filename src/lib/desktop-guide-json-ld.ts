import {
  DESKTOP_GUIDE_DATES,
  DESKTOP_GUIDE_PATH,
  DESKTOP_GUIDE_TITLE_BASE,
  GUIDE_TITLE_BASE,
} from '@/lib/page-title'

/** /guide/claude-desktop as a TechArticle, with a breadcrumb through the main /guide. */
export function desktopGuideJsonLd(origin: string, description: string): object[] {
  const url = `${origin}${DESKTOP_GUIDE_PATH}`
  return [
    {
      '@context': 'https://schema.org',
      '@type': 'TechArticle',
      headline: DESKTOP_GUIDE_TITLE_BASE,
      url,
      description,
      author: { '@type': 'Organization', name: 'statuslin.es', url: origin },
      datePublished: DESKTOP_GUIDE_DATES.published,
      dateModified: DESKTOP_GUIDE_DATES.modified,
    },
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Status lines', item: origin },
        { '@type': 'ListItem', position: 2, name: GUIDE_TITLE_BASE, item: `${origin}/guide` },
        { '@type': 'ListItem', position: 3, name: DESKTOP_GUIDE_TITLE_BASE, item: url },
      ],
    },
  ]
}
