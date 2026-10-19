import type { CountedCopy } from '@/lib/use-counted-copy'
import { InstallPrompt } from '@/ui/install-prompt'
import { type InstallCommandKind, MOD_INSTALL_MIN_VERSION, modInstallPrompt } from './install'

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
      pasteHint={`Paste it into Claude Code or Claude Desktop. Mods need Claude Code ${MOD_INSTALL_MIN_VERSION} or later.`}
      onCopied={() => controller.record('prompt')}
    />
  )
}
