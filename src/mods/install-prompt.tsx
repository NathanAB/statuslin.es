import type { CountedCopy } from '@/lib/use-counted-copy'
import { InstallPrompt } from '@/ui/install-prompt'
import { type InstallCommandKind, MOD_INSTALL_MIN_VERSION, modInstallPrompt } from './install'

/** What a copied mod install prompt is for, said in the toast after the copy. */
export const MOD_PASTE_HINT = `Paste it into Claude Code or Claude Desktop. Mods need Claude Code ${MOD_INSTALL_MIN_VERSION} or later.`

/**
 * A mod's install control: the shared install prompt button and copy count, as on a status line
 * page. It shows no commands to run by hand, since only a copy through the button is counted.
 */
export function ModInstallPrompt({
  origin,
  slug,
  title,
  controller,
}: {
  origin: string
  slug: string
  title: string
  controller: CountedCopy<InstallCommandKind>
}) {
  return (
    <InstallPrompt
      prompt={modInstallPrompt(origin, slug)}
      title={title}
      count={controller.count}
      pasteHint={MOD_PASTE_HINT}
      onCopied={() => controller.record('prompt')}
    />
  )
}
