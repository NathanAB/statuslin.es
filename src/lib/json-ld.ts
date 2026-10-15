import type { PageCopy } from '@/content/types'
import type { GalleryKind } from '@/gallery/gallery-items'
import { breadcrumbJsonLd, HOME_CRUMB_NAME } from '@/lib/breadcrumb-json-ld'
import { withoutInlineCode } from '@/lib/inline-code'
import { homePageName, RESOURCES_TITLE_BASE } from '@/lib/page-title'
import { CONTENT_LICENSE, modPath } from '@/lib/site'

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

/** A gallery card as JSON-LD sees it: enough to name and link it. */
interface GalleryListEntry {
  kind: GalleryKind
  slug: string
  title: string
}

function galleryEntryUrl(origin: string, item: GalleryListEntry): string {
  return `${origin}${item.kind === 'mod' ? modPath(item.slug) : `/c/${item.slug}`}`
}

/** The site identity plus gallery CollectionPage and its visible status lines and mods, in order. */
export function homeJsonLd(
  origin: string,
  items: GalleryListEntry[],
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
          url: galleryEntryUrl(origin, item),
        })),
      },
    },
  ]
}

/** The `runtimePlatform` of every status line and mod. */
export const RUNTIME_PLATFORM = 'Claude Code'

/**
 * A config page as SoftwareSourceCode + breadcrumb, plus a FAQPage built from the page copy
 * the "What it does" card shows, when present. The SoftwareSourceCode carries `dateModified` (freshness),
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
    generatedContent: PageCopy | null
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
      runtimePlatform: RUNTIME_PLATFORM,
      license: config.license ?? CONTENT_LICENSE.url,
      ...(config.updatedAt ? { dateModified: config.updatedAt } : {}),
      ...(config.keywords.length > 0 ? { keywords: config.keywords.join(', ') } : {}),
      ...(config.authorName ? { author: { '@type': 'Person', name: config.authorName } } : {}),
    },
    breadcrumbJsonLd(crumbs),
  ]

  const faq = pageCopyFaqJsonLd(config.title, config.generatedContent)
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

/** A step or note as a sentence, so a list joins into a readable answer. */
const asSentence = (line: string) => (/[.!?]$/.test(line) ? line : `${line}.`)

/**
 * A status line or mod page's "What it does" copy as a FAQPage: the summary, steps and notes,
 * each as one question; an empty list asks nothing.
 */
export function pageCopyFaqJsonLd(title: string, copy: PageCopy | null): object | null {
  if (!copy) return null
  const lists = [
    { question: `How does ${title} work?`, lines: copy.howItWorks },
    { question: `What should I know before using ${title}?`, lines: copy.goodToKnow },
  ]
  return faqPageJsonLd([
    { question: `What does ${title} do?`, answer: copy.summary },
    ...lists
      .filter((list) => list.lines.length > 0)
      .map((list) => ({ question: list.question, answer: list.lines.map(asSentence).join(' ') })),
  ])
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
  /** The page's status lines and mods, in the order it shows them. */
  items: GalleryListEntry[],
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
        url: galleryEntryUrl(origin, item),
      })),
    },
  }
  const breadcrumbs = breadcrumbJsonLd([
    { name: HOME_CRUMB_NAME, item: origin },
    { name: facet.titleBase, item: url },
  ])
  const nodes =
    options.includeCollectionPage === false ? [breadcrumbs] : [collectionPage, breadcrumbs]
  const faqPage = faqPageJsonLd(options.faq ?? [])
  return faqPage ? [...nodes, faqPage] : nodes
}
