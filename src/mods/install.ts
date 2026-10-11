import { copierPersonProperties } from '@/lib/posthog-person'
import type { ServerEvent } from '@/lib/posthog-server'
import { MARKETPLACE_PATH } from '@/lib/site'

export type InstallCommandKind = 'session' | 'shell'

export interface InstallCommand {
  kind: InstallCommandKind
  label: string
  minVersion: string
  command: string
}

const MIN_VERSION: Record<InstallCommandKind, string> = { session: '2.1.275', shell: '2.1.292' }

function compareVersions(a: string, b: string): number {
  const [x, y] = [a, b].map((v) => v.split('.').map(Number))
  for (let i = 0; i < Math.max(x?.length ?? 0, y?.length ?? 0); i++) {
    const d = (x?.[i] ?? 0) - (y?.[i] ?? 0)
    if (d !== 0) return d
  }
  return 0
}

/** The Claude Code version that installing needs: the highest any install command needs. */
export const MOD_INSTALL_MIN_VERSION = Object.values(MIN_VERSION).reduce((max, v) =>
  compareVersions(v, max) > 0 ? v : max,
)

/** The mod's folder on GitHub at its pinned commit. */
export function modSourceUrl(pin: { repoUrl: string; path: string; commitSha: string }): string {
  const tree = `${pin.repoUrl}/tree/${pin.commitSha}`
  return pin.path === '' ? tree : `${tree}/${pin.path}`
}

export function installCommands(origin: string, pluginName: string): InstallCommand[] {
  const install = `install ${pluginName} --marketplace ${origin}${MARKETPLACE_PATH}`
  return [
    {
      kind: 'session',
      label: 'In Claude Code',
      minVersion: MIN_VERSION.session,
      command: `/plugin ${install}`,
    },
    {
      kind: 'shell',
      label: 'From a shell',
      minVersion: MIN_VERSION.shell,
      command: `claude plugin ${install}`,
    },
  ]
}

const COMMAND_KINDS: Record<InstallCommandKind, true> = { session: true, shell: true }

// Assigned through a variable key so the naming lint accepts PostHog's `$`-prefixed property.
const SESSION_ID_PROP = '$session_id'

/**
 * The PostHog event for copying a mod's install command, fired server-side like config copies so
 * ad blockers can't hide it. Null when there is no distinct id, or when `kind` (client input) is
 * not a command kind.
 */
export function modCopyEvent(input: {
  kind: InstallCommandKind
  modId: string
  distinctId: string | null | undefined
  signedInUserId: string | null
  sessionId?: string | null | undefined
}): ServerEvent | null {
  if (!input.distinctId || !Object.hasOwn(COMMAND_KINDS, input.kind)) return null
  const properties: Record<string, unknown> = {
    modId: input.modId,
    command: input.kind,
    ...copierPersonProperties(input.distinctId, input.signedInUserId),
  }
  if (input.sessionId) properties[SESSION_ID_PROP] = input.sessionId
  return { distinctId: input.distinctId, event: 'mod_install_command_copied', properties }
}
