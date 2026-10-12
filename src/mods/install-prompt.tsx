import type { CountedCopy } from '@/lib/use-counted-copy'
import { InstallPrompt } from '@/ui/install-prompt'
import { type InstallCommandKind, MOD_INSTALL_MIN_VERSION } from './install'

/** A mod's install control: the shared install prompt button and copy count, as on a status line page. */
export function ModInstallPrompt({
  prompt,
  title,
  controller,
}: {
  prompt: string
  title: string
  controller: CountedCopy<InstallCommandKind>
}) {
  return (
    <InstallPrompt
      prompt={prompt}
      title={title}
      count={controller.count}
      pasteHint={`Paste it into Claude Code ${MOD_INSTALL_MIN_VERSION} or later to install this mod.`}
      onCopied={() => controller.record('prompt')}
    />
  )
}
