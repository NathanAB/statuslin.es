import { DetailHeader } from '@/gallery/detail-header'
import { MODS_CRUMB } from '@/lib/breadcrumb-json-ld'
import { githubAvatarUrl } from '@/lib/github-avatars'
import { modSourceUrl } from './install'
import type { ModDetail } from './queries'

const SHORT_SHA_LENGTH = 7

/**
 * A mod page's header. The breadcrumb runs through the mods-filtered gallery; the byline links the
 * source at the pinned commit and always names the licence, or says there is none.
 */
export function ModHeader({ mod }: { mod: ModDetail }) {
  return (
    <DetailHeader
      trail={[{ name: MODS_CRUMB.name, to: '/', search: MODS_CRUMB.search }]}
      title={mod.title}
      byline={{
        author: {
          name: mod.authorGithub,
          username: mod.authorGithub,
          image: githubAvatarUrl(mod.authorGithub),
        },
        source: {
          lead: 'source at',
          label: mod.commitSha.slice(0, SHORT_SHA_LENGTH),
          href: modSourceUrl(mod),
        },
        license: mod.license ? `${mod.license} licence` : 'No licence',
      }}
      description={mod.description}
    />
  )
}
