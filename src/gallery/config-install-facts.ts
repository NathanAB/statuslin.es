import { Globe, Info, KeyRound, UserCheck } from 'lucide-react'
import type { PageCopy } from '@/content/types'
import type { ConfigDetail } from '@/gallery/queries'
import { utcDateLabel } from '@/lib/date-label'
import type { InstallFact } from '@/ui/install-facts'

/** What a status line's script can reach, from the facts stored with its version: the login it
 *  reads and the hosts it calls are risks to weigh; no network is said plainly too. */
export function reachFacts(
  config: Pick<ConfigDetail, 'readsClaudeToken' | 'networkHosts'>,
): InstallFact[] {
  return [
    ...(config.readsClaudeToken
      ? [{ icon: KeyRound, text: 'Reads your Claude login', caution: true }]
      : []),
    config.networkHosts.length > 0
      ? {
          icon: Globe,
          text: `Calls ${config.networkHosts.map((host) => `\`${host}\``).join(', ')}`,
          caution: true,
        }
      : { icon: Globe, text: 'No network access' },
  ]
}

/**
 * What a status line page says beside its install button: that a person read this version, what
 * the script can reach (from the facts stored with the version, never from the copy), then the
 * page copy's good-to-know notes, where its requirements go.
 */
export function configInstallFacts(
  config: Pick<ConfigDetail, 'updatedAt' | 'readsClaudeToken' | 'networkHosts'> & {
    generatedContent: Pick<PageCopy, 'goodToKnow'> | null
  },
): InstallFact[] {
  return [
    { icon: UserCheck, text: `Read by a person · this version, ${utcDateLabel(config.updatedAt)}` },
    ...reachFacts(config),
    ...(config.generatedContent?.goodToKnow ?? []).map((note) => ({ icon: Info, text: note })),
  ]
}
