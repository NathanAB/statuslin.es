import { GUIDE_TITLE_BASE, HOME_TITLE_BASE, RESOURCES_TITLE_BASE } from '@/lib/page-title'
import { CONTENT_LICENSE } from '@/lib/site'

/**
 * JSON-LD structured data for search engines. Server-rendered via TanStack
 * `head().scripts` (the pattern from TanStack Start's SEO guide), so crawlers
 * see it without JavaScript.
 */

/**
 * Wraps JSON-LD data as a head() script descriptor. Escapes `<` so user-supplied
 * strings (config titles, descriptions) can never contain `</script>` and break
 * out of the inline script tag.
 */
export function jsonLdScript(data: object): { type: 'application/ld+json'; children: string } {
  return {
    type: 'application/ld+json',
    children: JSON.stringify(data).replace(/</g, '\\u003c'),
  }
}

/** The gallery home as a CollectionPage whose main entity lists the visible configs. */
export function homeJsonLd(origin: string, items: Array<{ slug: string; title: string }>): object {
  return {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: HOME_TITLE_BASE,
    url: origin,
    mainEntity: {
      '@type': 'ItemList',
      itemListElement: items.map((item, i) => ({
        '@type': 'ListItem',
        position: i + 1,
        name: item.title,
        url: `${origin}/c/${item.slug}`,
      })),
    },
  }
}

/** A config page as SoftwareSourceCode plus its breadcrumb trail back to the gallery. */
export function configJsonLd(
  origin: string,
  config: {
    slug: string
    title: string
    description: string
    interpreter: string
    authorName: string | null
  },
): object[] {
  const url = `${origin}/c/${config.slug}`
  return [
    {
      '@context': 'https://schema.org',
      '@type': 'SoftwareSourceCode',
      name: config.title,
      description: config.description,
      url,
      programmingLanguage: config.interpreter,
      license: CONTENT_LICENSE.url,
      ...(config.authorName ? { author: { '@type': 'Person', name: config.authorName } } : {}),
    },
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Status lines', item: origin },
        { '@type': 'ListItem', position: 2, name: config.title, item: url },
      ],
    },
  ]
}

/** The /resources page as a CollectionPage listing the external tools/resources. */
export function resourcesJsonLd(
  origin: string,
  items: Array<{ name: string; url: string }>,
): object {
  return {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: RESOURCES_TITLE_BASE,
    url: `${origin}/resources`,
    mainEntity: {
      '@type': 'ItemList',
      itemListElement: items.map((item, i) => ({
        '@type': 'ListItem',
        position: i + 1,
        name: item.name,
        url: item.url,
      })),
    },
  }
}

/** The /guide page as a TechArticle. */
export function guideJsonLd(origin: string, description: string): object {
  return {
    '@context': 'https://schema.org',
    '@type': 'TechArticle',
    headline: GUIDE_TITLE_BASE,
    url: `${origin}/guide`,
    description,
  }
}
