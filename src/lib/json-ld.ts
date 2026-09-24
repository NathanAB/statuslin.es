import type { GeneratedContent } from '@/content/types'
import { withoutInlineCode } from '@/lib/inline-code'
import { GUIDE_DATES, GUIDE_TITLE_BASE, homePageName, RESOURCES_TITLE_BASE } from '@/lib/page-title'
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

/** The breadcrumb name of the home page, shared by the visible config breadcrumb. */
export const HOME_CRUMB_NAME = 'Status lines'

/** The site identity plus gallery CollectionPage and its visible configs. */
export function homeJsonLd(
  origin: string,
  items: Array<{ slug: string; title: string }>,
  options: { page: number; pageSize: number; includeCollectionPage?: boolean },
): object[] {
  const website = {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: 'statuslin.es',
    url: origin,
  }
  if (options.includeCollectionPage === false) return [website]

  const positionOffset = (options.page - 1) * options.pageSize
  return [
    website,
    {
      '@context': 'https://schema.org',
      '@type': 'CollectionPage',
      name: homePageName(options.page),
      url: options.page > 1 ? `${origin}/?page=${options.page}` : origin,
      mainEntity: {
        '@type': 'ItemList',
        itemListElement: items.map((item, i) => ({
          '@type': 'ListItem',
          position: positionOffset + i + 1,
          name: item.title,
          url: `${origin}/c/${item.slug}`,
        })),
      },
    },
  ]
}

/**
 * A config page as SoftwareSourceCode + breadcrumb, plus a FAQPage built from the
 * generated copy when present. The SoftwareSourceCode carries `dateModified` (freshness),
 * `runtimePlatform`, and facet `keywords`.
 */
export function configJsonLd(
  origin: string,
  config: {
    slug: string
    title: string
    description: string
    interpreter: string
    authorName: string | null
    license: string | null
    keywords: string[]
    updatedAt: string | null
    generatedContent: GeneratedContent | null
    /** The facet page the breadcrumb passes through, or null for Home › Config. */
    primaryFacet: { slug: string; heading: string } | null
  },
): object[] {
  const url = `${origin}/c/${config.slug}`
  const crumbs = [
    { name: HOME_CRUMB_NAME, item: origin },
    ...(config.primaryFacet
      ? [
          {
            name: config.primaryFacet.heading,
            item: `${origin}/status-lines/${config.primaryFacet.slug}`,
          },
        ]
      : []),
    { name: config.title, item: url },
  ]
  const nodes: object[] = [
    {
      '@context': 'https://schema.org',
      '@type': 'SoftwareSourceCode',
      name: config.title,
      description: config.description,
      url,
      programmingLanguage: config.interpreter,
      runtimePlatform: 'Claude Code',
      license: config.license ?? CONTENT_LICENSE.url,
      ...(config.updatedAt ? { dateModified: config.updatedAt } : {}),
      ...(config.keywords.length > 0 ? { keywords: config.keywords.join(', ') } : {}),
      ...(config.authorName ? { author: { '@type': 'Person', name: config.authorName } } : {}),
    },
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: crumbs.map((crumb, i) => ({
        '@type': 'ListItem',
        position: i + 1,
        ...crumb,
      })),
    },
  ]

  const faq = configFaqJsonLd(config.title, config.generatedContent)
  if (faq) nodes.push(faq)
  return nodes
}

export interface FaqEntry {
  question: string
  answer: string
}

export function faqPageJsonLd(entries: FaqEntry[]): object | null {
  if (entries.length === 0) return null
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: entries.map((entry) => ({
      '@type': 'Question',
      name: entry.question,
      acceptedAnswer: { '@type': 'Answer', text: withoutInlineCode(entry.answer) },
    })),
  }
}

function configFaqJsonLd(title: string, content: GeneratedContent | null): object | null {
  if (!content) return null
  const sections = [
    { question: `What does ${title} show?`, lines: content.whatItShows },
    { question: `What does ${title} require?`, lines: content.requirements },
    { question: `How does ${title} behave?`, lines: content.behaviorNotes },
  ]
  return faqPageJsonLd(
    sections
      .filter((s) => s.lines.length > 0)
      .map((s) => ({ question: s.question, answer: s.lines.join(' ') })),
  )
}

export function guideJsonLd(origin: string, description: string, faq: FaqEntry[]): object[] {
  const url = `${origin}/guide`
  const nodes: object[] = [
    {
      '@context': 'https://schema.org',
      '@type': 'TechArticle',
      headline: GUIDE_TITLE_BASE,
      url,
      description,
      author: { '@type': 'Organization', name: 'statuslin.es', url: origin },
      datePublished: GUIDE_DATES.published,
      dateModified: GUIDE_DATES.modified,
    },
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Status lines', item: origin },
        { '@type': 'ListItem', position: 2, name: GUIDE_TITLE_BASE, item: url },
      ],
    },
  ]
  const faqPage = faqPageJsonLd(faq)
  if (faqPage) nodes.push(faqPage)
  return nodes
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

export function facetJsonLd(
  origin: string,
  facet: { slug: string; titleBase: string },
  items: Array<{ slug: string; title: string }>,
  /** ISO date (YYYY-MM-DD) of the newest config in the facet, or null — a freshness signal. */
  updated: string | null,
  options: { includeCollectionPage?: boolean; faq?: FaqEntry[] | undefined } = {},
): object[] {
  const url = `${origin}/status-lines/${facet.slug}`
  const collectionPage = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: facet.titleBase,
    url,
    ...(updated ? { dateModified: updated } : {}),
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
  const breadcrumbs = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Status lines', item: origin },
      { '@type': 'ListItem', position: 2, name: facet.titleBase, item: url },
    ],
  }
  const nodes =
    options.includeCollectionPage === false ? [breadcrumbs] : [collectionPage, breadcrumbs]
  const faqPage = faqPageJsonLd(options.faq ?? [])
  return faqPage ? [...nodes, faqPage] : nodes
}
