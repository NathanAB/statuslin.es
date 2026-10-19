import { buildClaudePrompt } from '@/adopt/install'
import type { RecordedCopyController } from '@/adopt/use-recorded-copy'
import type { Interpreter } from '@/render/types'
import { InstallPrompt } from '@/ui/install-prompt'

interface AdoptPromptProps {
  source: string
  interpreter: Interpreter
  title: string
  controller: RecordedCopyController
}

/** What a status line's install prompt toast tells you to do with it. */
export const STATUS_LINE_PASTE_HINT = 'Paste it into Claude Code to set up this status line.'

/** A status line's install control: the shared install prompt button and copy count. */
export function AdoptPrompt({ source, interpreter, title, controller }: AdoptPromptProps) {
  return (
    <InstallPrompt
      prompt={buildClaudePrompt({ source, interpreter, title })}
      title={title}
      count={controller.count}
      pasteHint={STATUS_LINE_PASTE_HINT}
      onCopied={() => controller.record('prompt')}
    />
  )
}
