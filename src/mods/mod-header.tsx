import { usePostHog } from '@posthog/react'
import { ConfigBadges } from '@/gallery/config-badges'
import { DetailHeader } from '@/gallery/detail-header'
import { MODS_CRUMB } from '@/lib/breadcrumb-json-ld'
import { githubAvatarUrl } from '@/lib/github-avatars'
import { modSourceUrl } from './install'
import type { ModDetail } from './queries'

const SHORT_SHA_LENGTH = 7

/**
 * A mod page's header. The breadcrumb runs through the mods page; the tag chips match
 * the mod's gallery card; the byline links the source at the pinned commit and always names the
 * licence, or says there is none.
 */
export function ModHeader({ mod }: { mod: ModDetail }) {
  const posthog = usePostHog()

  return (
    <DetailHeader
      trail={[MODS_CRUMB]}
      title={mod.title}
      chips={<ConfigBadges tags={mod.tags} networkHosts={[]} />}
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
          // Reading the source is how a visitor decides to trust a mod before installing it.
          onClick: () => posthog.capture('mod_source_clicked', { modId: mod.id, slug: mod.slug }),
        },
        license: mod.license ? `${mod.license} licence` : 'No licence',
      }}
      description={mod.description}
    />
  )
}
