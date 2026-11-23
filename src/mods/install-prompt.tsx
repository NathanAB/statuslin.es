import type { CountedCopy } from '@/lib/use-counted-copy'
import { InstallPrompt } from '@/ui/install-prompt'
import {
  type InstallCommandKind,
  MOD_INSTALL_MIN_VERSION,
  modInstallPrompt,
  THEME_PLUGIN_INSTALL_MIN_VERSION,
} from './install'

/** What a copied mod install prompt is for, said in the toast after the copy. */
export const MOD_PASTE_HINT = `Paste it into Claude Code or Claude Desktop. Mods need Claude Code ${MOD_INSTALL_MIN_VERSION} or later.`

/** The same for a theme plugin: its themes are picked in the terminal's `/theme`. */
const THEME_PLUGIN_PASTE_HINT = `Paste it into Claude Code or Claude Desktop, then pick a theme with /theme in the terminal. Theme plugins need Claude Code ${THEME_PLUGIN_INSTALL_MIN_VERSION} or later.`

/**
 * A mod's install control: the shared install prompt button and copy count, as on a status line
 * page. It shows no commands to run by hand, since only a copy through the button is counted.
 */
export function ModInstallPrompt({
  origin,
  slug,
  title,
  themeOnly,
  controller,
}: {
  origin: string
  slug: string
  title: string
  themeOnly: boolean
  controller: CountedCopy<InstallCommandKind>
}) {
  return (
    <InstallPrompt
      prompt={modInstallPrompt(origin, slug, { themeOnly })}
      title={title}
      count={controller.count}
      pasteHint={themeOnly ? THEME_PLUGIN_PASTE_HINT : MOD_PASTE_HINT}
      onCopied={() => controller.record('prompt')}
    />
  )
}
