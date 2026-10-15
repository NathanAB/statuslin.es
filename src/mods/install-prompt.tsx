import type { CountedCopy } from '@/lib/use-counted-copy'
import { CodeBlock } from '@/ui/code-block'
import { InstallPrompt } from '@/ui/install-prompt'
import { Stack } from '@/ui/layout'
import { Text } from '@/ui/text'
import {
  type InstallCommandKind,
  MOD_INSTALL_MIN_VERSION,
  modInstallCommands,
  modInstallPrompt,
} from './install'

/**
 * A mod's install control: the shared install prompt button and copy count, as on a status line
 * page, then the commands it runs as text, for a reader who'd rather run them.
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
    <Stack gap={3}>
      <InstallPrompt
        prompt={modInstallPrompt(origin, slug)}
        title={title}
        count={controller.count}
        pasteHint={`Paste it into Claude Code ${MOD_INSTALL_MIN_VERSION} or later.`}
        onCopied={() => controller.record('prompt')}
      />
      <Stack gap={1.5}>
        <Text muted size="sm">
          Or run it yourself:
        </Text>
        <CodeBlock wrap>{modInstallCommands(origin, slug).join('\n')}</CodeBlock>
      </Stack>
    </Stack>
  )
}
