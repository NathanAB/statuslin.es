import type { GeneratedContent } from '@/content/types'
import { HOME_TITLE_BASE, RESOURCES_TITLE_BASE } from '@/lib/page-title'
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

/** The site identity plus gallery CollectionPage and its visible configs. */
export function homeJsonLd(
  origin: string,
  items: Array<{ slug: string; title: string }>,
): object[] {
  return [
    {
      '@context': 'https://schema.org',
      '@type': 'WebSite',
      name: 'statuslin.es',
      url: origin,
    },
    {
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
    },
  ]
}

/**
 * A config page as SoftwareSourceCode + breadcrumb, plus a FAQPage built from the
 * generated copy when present. The SoftwareSourceCode carries the GEO signals AI answer
 * engines weight: `dateModified` (freshness), an upvote `interactionStatistic` (a real
 * stat), `runtimePlatform`, and facet `keywords`.
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
    upvoteCount: number
    keywords: string[]
    updatedAt: string | null
    generatedContent: GeneratedContent | null
  },
): object[] {
  const url = `${origin}/c/${config.slug}`
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
      interactionStatistic: {
        '@type': 'InteractionCounter',
        interactionType: 'https://schema.org/LikeAction',
        userInteractionCount: config.upvoteCount,
      },
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

  const faq = configFaqJsonLd(config.title, config.generatedContent)
  if (faq) nodes.push(faq)
  return nodes
}

/**
 * Turn the generated "what it shows / requirements / behavior notes" copy into a FAQPage —
 * the extractable Q&A shape ChatGPT/Perplexity/Claude reward. Skips empty sections, and
 * returns null when there is nothing to say.
 */
function configFaqJsonLd(title: string, content: GeneratedContent | null): object | null {
  if (!content) return null
  const sections = [
    { q: `What does ${title} show?`, lines: content.whatItShows },
    { q: `What does ${title} require?`, lines: content.requirements },
    { q: `How does ${title} behave?`, lines: content.behaviorNotes },
  ]
  const mainEntity = sections
    .filter((s) => s.lines.length > 0)
    .map((s) => ({
      '@type': 'Question',
      name: s.q,
      acceptedAnswer: { '@type': 'Answer', text: s.lines.join(' ') },
    }))
  if (mainEntity.length === 0) return null
  return { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity }
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

/** A facet page as CollectionPage + its breadcrumb trail back to the gallery. */
export function facetJsonLd(
  origin: string,
  facet: { slug: string; titleBase: string },
  items: Array<{ slug: string; title: string }>,
  /** ISO date (YYYY-MM-DD) of the newest config in the facet, or null — a freshness signal. */
  updated: string | null,
): object[] {
  const url = `${origin}/status-lines/${facet.slug}`
  return [
    {
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
    },
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Status lines', item: origin },
        { '@type': 'ListItem', position: 2, name: facet.titleBase, item: url },
      ],
    },
  ]
}
