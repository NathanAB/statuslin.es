import { Globe, GlobeLock, Info, KeyRound, ShieldCheck } from 'lucide-react'
import type { PageCopy } from '@/content/types'
import type { ConfigDetail } from '@/gallery/queries'
import { listPhrase } from '@/gallery/why-line'
import { utcDateLabel } from '@/lib/date-label'
import type { InstallFact } from '@/ui/install-facts'

/** What a status line's script can reach, from the facts stored with its version: the sign-in
 *  token it reads and the hosts it connects to are risks to weigh; asking for no internet is said too. */
export function reachFacts(
  config: Pick<ConfigDetail, 'readsClaudeToken' | 'networkHosts'>,
): InstallFact[] {
  return [
    ...(config.readsClaudeToken
      ? [{ icon: KeyRound, text: 'Reads your Claude sign-in token', caution: true }]
      : []),
    config.networkHosts.length > 0
      ? {
          icon: Globe,
          text: `Connects to ${config.networkHosts.map((host) => `\`${host}\``).join(', ')}`,
          caution: true,
        }
      : { icon: GlobeLock, text: "Doesn't ask to reach the internet" },
  ]
}

const asCode = (host: string) => `\`${host}\``

/**
 * The same reach as one short line, for the home hero: "Reads your Claude sign-in token and
 * connects to `wttr.in`".
 */
export function reachSentence(
  config: Pick<ConfigDetail, 'readsClaudeToken' | 'networkHosts'>,
): InstallFact {
  const reaches = [
    ...(config.readsClaudeToken ? ['reads your Claude sign-in token'] : []),
    ...(config.networkHosts.length > 0
      ? [`connects to ${listPhrase(config.networkHosts.map(asCode))}`]
      : []),
  ]
  if (reaches.length === 0) return { icon: GlobeLock, text: "Doesn't ask to reach the internet" }
  const text = reaches.join(' and ')
  return {
    icon: config.readsClaudeToken ? KeyRound : Globe,
    text: text.charAt(0).toUpperCase() + text.slice(1),
    caution: true,
  }
}

/**
 * What a status line page says beside its install button: that this version was reviewed, what
 * the script can reach (from the facts stored with the version, never from the copy), then the
 * page copy's good-to-know notes, where its requirements go.
 */
export function configInstallFacts(
  config: Pick<ConfigDetail, 'updatedAt' | 'readsClaudeToken' | 'networkHosts'> & {
    generatedContent: Pick<PageCopy, 'goodToKnow'> | null
  },
): InstallFact[] {
  return [
    {
      icon: ShieldCheck,
      text: `Reviewed before listing · this version, ${utcDateLabel(config.updatedAt)}`,
    },
    ...reachFacts(config),
    ...(config.generatedContent?.goodToKnow ?? []).map((note) => ({ icon: Info, text: note })),
  ]
}
