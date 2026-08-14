import { toast } from 'sonner'
import { buildClaudePrompt } from '@/adopt/install'
import type { RecordedCopyController } from '@/adopt/use-recorded-copy'
import type { Interpreter } from '@/render/types'
import { CopyButton } from '@/ui/copy-button'
import { CopyCount } from '@/ui/copy-count'
import { Row } from '@/ui/layout'

interface AdoptPromptProps {
  source: string
  interpreter: Interpreter
  title: string
  controller: RecordedCopyController
}

/** Title-row adopt control: primary "Copy install prompt" button + the displayed copy count. */
export function AdoptPrompt({ source, interpreter, title, controller }: AdoptPromptProps) {
  function onCopied() {
    controller.record('prompt')
    toast('Prompt copied', {
      description: 'Paste it into Claude Code to set up this status line.',
    })
  }

  return (
    <Row gap={3} wrap>
      <CopyButton
        text={buildClaudePrompt({ source, interpreter, title })}
        label="Copy install prompt"
        size="lg"
        variant="default"
        ariaLabel={`Copy install prompt — ${title}`}
        onCopied={onCopied}
      />
      <CopyCount count={controller.count} />
    </Row>
  )
}
