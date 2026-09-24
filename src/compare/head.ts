import type { ComparePage } from '@/compare/pages'
import { canonicalLink } from '@/lib/canonical'
import { jsonLdScript } from '@/lib/json-ld'
import { configListPageJsonLd } from '@/lib/json-ld-lists'
import { NOT_FOUND_TITLE } from '@/lib/page-title'
import { siteUrl } from '@/lib/site'
import { staticPageSocialMeta } from '@/og/meta'

/** head() for a comparison route: title, description, OG, canonical, and ItemList JSON-LD. */
export function comparePageHead(page: ComparePage | undefined) {
  if (!page) return { meta: [{ title: NOT_FOUND_TITLE }] }
  return {
    meta: [
      { title: page.title },
      { name: 'description', content: page.description },
      ...staticPageSocialMeta({
        path: page.path,
        title: page.heading,
        description: page.description,
      }),
    ],
    links: [canonicalLink(page.path)],
    scripts: configListPageJsonLd(
      siteUrl(),
      { path: page.path, name: page.heading },
      page.cards.map(({ card }) => ({ slug: card.slug, title: card.title })),
    ).map(jsonLdScript),
  }
}
