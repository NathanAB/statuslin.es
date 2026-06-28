import { Check, Copy } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { buildClaudePrompt } from '@/adopt/install'
import { useRecordedCopy } from '@/adopt/use-recorded-copy'
import type { Interpreter } from '@/render/types'
import { Button } from '@/ui/button'
import { Row } from '@/ui/layout'

interface AdoptPromptProps {
  source: string
  interpreter: Interpreter
  title: string
  configId: string
  copyCount: number
}

/** Title-row adopt control: primary "Copy prompt" button + the displayed copy count. */
export function AdoptPrompt({ source, interpreter, title, configId, copyCount }: AdoptPromptProps) {
  const { copy } = useRecordedCopy(configId, copyCount)
  const [copied, setCopied] = useState(false)

  function copyPrompt() {
    copy(buildClaudePrompt({ source, interpreter, title }), 'prompt', () => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
      toast('Prompt copied', {
        description: 'Paste it into Claude Code to set up this status line.',
      })
    })
  }

  return (
    <Row gap={3} wrap>
      <Button size="lg" onClick={copyPrompt} aria-label={`Copy Prompt — ${title}`}>
        {copied ? <Check /> : <Copy />}
        {copied ? 'Copied!' : 'Copy Prompt'}
      </Button>
    </Row>
  )
}

interface CopyScriptButtonProps {
  source: string
  configId: string
}

/** Source-card control: outline button copying the raw script. Records the copy too, but the
 *  count it bumps is its own instance — the title-row count won't reflect a script copy until
 *  the page reloads. That's acceptable: the count is an approximate signal. */
export function CopyScriptButton({ source, configId }: CopyScriptButtonProps) {
  const { copy } = useRecordedCopy(configId, 0)
  const [copied, setCopied] = useState(false)

  function copyScript() {
    copy(source, 'script', () => {
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
