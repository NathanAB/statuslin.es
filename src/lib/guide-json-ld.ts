import { breadcrumbJsonLd, HOME_CRUMB_NAME } from '@/lib/breadcrumb-json-ld'
import { type FaqEntry, faqPageJsonLd } from '@/lib/json-ld'
import { GUIDE_PATH, GUIDE_TITLE_BASE } from '@/lib/page-title'

/** A /guide page as its TechArticle states it; `headline` is the page's title base. */
export interface GuideArticle {
  path: string
  headline: string
  description: string
  dates: { published: string; modified: string }
}

/**
 * A /guide page as a dated TechArticle authored by the site, a breadcrumb that runs through /guide,
 * and its questions as a FAQPage when it has any. Never HowTo.
 */
export function guideJsonLd(origin: string, article: GuideArticle, faq: FaqEntry[] = []): object[] {
  const url = `${origin}${article.path}`
  const ownCrumb = article.path === GUIDE_PATH ? [] : [{ name: article.headline, item: url }]
  const nodes: object[] = [
    {
      '@context': 'https://schema.org',
      '@type': 'TechArticle',
      headline: article.headline,
      url,
      description: article.description,
      author: { '@type': 'Organization', name: 'statuslin.es', url: origin },
      datePublished: article.dates.published,
      dateModified: article.dates.modified,
    },
    breadcrumbJsonLd([
      { name: HOME_CRUMB_NAME, item: origin },
      { name: GUIDE_TITLE_BASE, item: `${origin}${GUIDE_PATH}` },
      ...ownCrumb,
    ]),
  ]
  const faqPage = faqPageJsonLd(faq)
  if (faqPage) nodes.push(faqPage)
  return nodes
}
