import { copierPersonProperties } from '@/lib/posthog-person'
import type { ServerEvent } from '@/lib/posthog-server'
import { MARKETPLACE_PATH } from '@/lib/site'
import { MARKETPLACE_NAME } from './marketplace'

/** How a visitor installed: today only the copied install prompt. */
export type InstallCommandKind = 'prompt'

/**
 * The Claude Code version mods need: the floor at which the band, hint line and spinner draw in
 * both the terminal and Desktop, per https://code.claude.com/docs/en/plugins/mods/reference#render-sites
 * (docs/research/2026-10-02-claude-code-mods.md). The install commands themselves are older.
 */
export const MOD_INSTALL_MIN_VERSION = '2.1.287'

/** The Claude Code a session runs on, falling back to the one on PATH. */
const SESSION_CLAUDE = `"\${CLAUDE_CODE_EXECPATH:-claude}"`

/**
 * The prompt a visitor pastes into Claude Code or Claude Desktop to install a mod. `/plugin` can't
 * do it: Desktop has no `/plugin` command. So Claude adds the marketplace (safe to repeat) and
 * installs from it in the shell, with the Claude Code it runs on: Desktop puts no `claude` on
 * PATH, but every session sets `CLAUDE_CODE_EXECPATH`. `entryName` is the mod's marketplace entry
 * name: its slug.
 */
export function modInstallPrompt(origin: string, entryName: string): string {
  const marketplaceUrl = `${origin}${MARKETPLACE_PATH}`
  return [
    `Install the ${entryName} mod from ${new URL(origin).host}. Run this in your shell, then tell me to start a new session to load it:`,
    `${SESSION_CLAUDE} plugin marketplace add ${marketplaceUrl} && ${SESSION_CLAUDE} plugin install ${entryName}@${MARKETPLACE_NAME}`,
  ].join('\n')
}

/** The mod's folder on GitHub at its pinned commit. */
export function modSourceUrl(pin: { repoUrl: string; path: string; commitSha: string }): string {
  const tree = `${pin.repoUrl}/tree/${pin.commitSha}`
  return pin.path === '' ? tree : `${tree}/${pin.path}`
}

const COMMAND_KINDS: Record<InstallCommandKind, true> = { prompt: true }

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
