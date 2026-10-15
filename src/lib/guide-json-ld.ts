import { breadcrumbJsonLd, GUIDE_CRUMB, HOME_CRUMB_NAME } from '@/lib/breadcrumb-json-ld'
import { type FaqEntry, faqPageJsonLd } from '@/lib/json-ld'
import { GUIDE_PATH } from '@/lib/page-title'
import { SITE_NAME } from '@/lib/site'

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
      author: { '@type': 'Organization', name: SITE_NAME, url: origin },
      datePublished: article.dates.published,
      dateModified: article.dates.modified,
    },
    breadcrumbJsonLd([
      { name: HOME_CRUMB_NAME, item: origin },
      { name: GUIDE_CRUMB.name, item: `${origin}${GUIDE_CRUMB.to}` },
      ...ownCrumb,
    ]),
  ]
  const faqPage = faqPageJsonLd(faq)
  if (faqPage) nodes.push(faqPage)
  return nodes
}
