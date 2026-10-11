import { ConfigBadges } from '@/gallery/config-badges'
import { DetailHeader } from '@/gallery/detail-header'
import type { ConfigDetail } from '@/gallery/queries'

type HeaderDetail = Pick<
  ConfigDetail,
  'title' | 'description' | 'author' | 'tags' | 'networkHosts' | 'license' | 'sourceUrl'
> & { primaryFacet: { slug: string; heading: string } | null }

/**
 * A status line page's header. The breadcrumb runs through its primary facet page; the byline
 * links the original source and names the licence only for seeded third-party status lines.
 * Submitters' own have neither (CC0 per the terms page).
 */
export function ConfigHeader({ detail }: { detail: HeaderDetail }) {
  return (
    <DetailHeader
      trail={
        detail.primaryFacet
          ? [
              {
                name: detail.primaryFacet.heading,
                to: '/status-lines/$facet',
                params: { facet: detail.primaryFacet.slug },
              },
            ]
          : []
      }
      title={detail.title}
      chips={<ConfigBadges tags={detail.tags} networkHosts={detail.networkHosts} />}
      byline={{
        author: detail.author,
        source: detail.sourceUrl ? { label: 'original source', href: detail.sourceUrl } : null,
        license: detail.license ? `${detail.license} licensed` : null,
      }}
      description={detail.description}
    />
  )
}
