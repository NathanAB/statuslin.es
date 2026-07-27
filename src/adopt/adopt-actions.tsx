import { Check, Copy } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { buildClaudePrompt } from '@/adopt/install'
import type { RecordedCopyController } from '@/adopt/use-recorded-copy'
import type { Interpreter } from '@/render/types'
import { Button } from '@/ui/button'
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
  const [copied, setCopied] = useState(false)

  function copyPrompt() {
    controller.copy(buildClaudePrompt({ source, interpreter, title }), 'prompt', () => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
      toast('Prompt copied', {
        description: 'Paste it into Claude Code to set up this status line.',
      })
    })
  }

  return (
    <Row gap={3} wrap>
      <Button size="lg" onClick={copyPrompt} aria-label={`Copy install prompt — ${title}`}>
        {copied ? <Check /> : <Copy />}
        {copied ? 'Copied!' : 'Copy install prompt'}
      </Button>
      <CopyCount count={controller.count} />
    </Row>
  )
}

interface CopyScriptButtonProps {
  source: string
  controller: RecordedCopyController
}

/** Source-card control: outline button copying raw source through the page's shared recorder. */
export function CopyScriptButton({ source, controller }: CopyScriptButtonProps) {
  const [copied, setCopied] = useState(false)

  function copyScript() {
    controller.copy(source, 'script', () => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <Button variant="outline" size="lg" onClick={copyScript}>
      {copied ? <Check /> : <Copy />}
      {copied ? 'Copied!' : 'Copy script'}
    </Button>
  )
}
