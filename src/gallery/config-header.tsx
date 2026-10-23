import { ConfigBadges, topicTags } from '@/gallery/config-badges'
import { DetailHeader } from '@/gallery/detail-header'
import type { ConfigDetail } from '@/gallery/queries'

type HeaderDetail = Pick<
  ConfigDetail,
  'title' | 'description' | 'author' | 'tags' | 'networkHosts' | 'license' | 'sourceUrl'
> & { primaryFacet: { slug: string; topic: string } | null }

/**
 * A status line page's header. The breadcrumb runs through its primary facet page, by the short
 * topic name that page's own breadcrumb uses; the byline links the original source and names the
 * licence only for seeded third-party status lines. Submitters' own have neither (CC0 per the
 * terms page).
 */
export function ConfigHeader({ detail }: { detail: HeaderDetail }) {
  return (
    <DetailHeader
      trail={
        detail.primaryFacet
          ? [
              {
                name: detail.primaryFacet.topic,
                to: '/status-lines/$facet',
                params: { facet: detail.primaryFacet.slug },
              },
            ]
          : []
      }
      title={detail.title}
      // What it can reach is a risk to weigh, said in the install panel, not a topic chip.
      chips={<ConfigBadges tags={topicTags(detail.tags)} networkHosts={detail.networkHosts} />}
      byline={{
        author: detail.author,
        source: detail.sourceUrl ? { label: 'original source', href: detail.sourceUrl } : null,
        license: detail.license ? `${detail.license} license` : null,
      }}
      description={detail.description}
    />
  )
}
