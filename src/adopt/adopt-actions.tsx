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

/** A status line's install control: the shared install prompt button and copy count. */
export function AdoptPrompt({ source, interpreter, title, controller }: AdoptPromptProps) {
  return (
    <InstallPrompt
      prompt={buildClaudePrompt({ source, interpreter, title })}
      title={title}
      count={controller.count}
      pasteHint="Paste it into Claude Code to set up this status line."
      onCopied={() => controller.record('prompt')}
    />
  )
}
