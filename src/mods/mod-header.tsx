import { usePostHog } from '@posthog/react'
import { ConfigBadges } from '@/gallery/config-badges'
import { DetailHeader } from '@/gallery/detail-header'
import { listPhrase } from '@/gallery/why-line'
import { MODS_CRUMB } from '@/lib/breadcrumb-json-ld'
import { githubAvatarUrl } from '@/lib/github-avatars'
import { modSourceUrl } from './install'
import { SHORT_SHA_LENGTH } from './mod-fact-tiles'
import type { ModDetail } from './queries'

/**
 * What each job tag says a mod shows, in subtitle order. A tag is set only when the mod
 * demonstrably shows it (src/content/tags.ts); style tags such as `minimal` name no job.
 */
const JOB_BY_TAG: Record<string, string> = {
  git: 'git state',
  'token-usage': 'context window usage',
  cost: 'session cost',
  quota: 'rate limits',
  'burn-rate': 'burn rate',
  weather: 'live weather',
  markets: 'live market prices',
}

/** "A Claude Code mod that shows …" from the mod's job tags, or null when none names a job. */
function modSubtitle(tags: string[]): string | null {
  const jobs = Object.entries(JOB_BY_TAG)
    .filter(([tag]) => tags.includes(tag))
    .map(([, job]) => job)
  return jobs.length > 0 ? `A Claude Code mod that shows ${listPhrase(jobs)}` : null
}

/**
 * A mod page's header. The breadcrumb runs through the mods page; the tag chips match
 * the mod's gallery card; the subtitle names its job from its tags; the byline links the source
 * at the pinned commit and always names the licence, or says there is none.
 */
export function ModHeader({ mod }: { mod: ModDetail }) {
  const posthog = usePostHog()

  return (
    <DetailHeader
      trail={[MODS_CRUMB]}
      title={mod.title}
      subtitle={modSubtitle(mod.tags)}
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
