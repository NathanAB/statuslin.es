import { Globe, KeyRound, Monitor } from 'lucide-react'
import { iconFor } from '@/gallery/config-badges'
import type { ConfigDetail } from '@/gallery/queries'
import type { Interpreter } from '@/render/types'
import type { FactTile } from '@/ui/fact-tiles'

const INTERPRETER_NAME: Record<Interpreter, string> = {
  bash: 'Bash',
  node: 'Node.js',
  python: 'Python',
}

/**
 * A status line's fact tiles, from the facts stored with its version. The page copy only words
 * the login tile, and only when the script does read the login.
 */
export function configFactTiles(
  config: Pick<
    ConfigDetail,
    'interpreter' | 'networkHosts' | 'readsClaudeToken' | 'generatedContent'
  >,
): FactTile[] {
  const details = config.generatedContent?.details ?? {}
  const network =
    config.networkHosts.length > 0
      ? config.networkHosts.map((host) => `\`${host}\``).join(', ')
      : 'None'
  return [
    {
      icon: iconFor(config.interpreter),
      label: 'Written in',
      value: INTERPRETER_NAME[config.interpreter],
    },
    { icon: Globe, label: 'Network access', value: network },
    ...(config.readsClaudeToken
      ? [
          {
            icon: KeyRound,
            label: 'Reads your Claude login',
            value: details.readsClaudeLogin ?? 'Yes',
            caution: true,
          },
        ]
      : []),
    { icon: Monitor, label: 'Works in', value: 'Terminal' },
  ]
}
