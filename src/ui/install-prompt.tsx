import { toast } from 'sonner'
import { CopyButton } from '@/ui/copy-button'
import { CopyCount } from '@/ui/copy-count'
import { Row } from '@/ui/layout'

/**
 * The install control on status line and mod pages: a large primary "Copy install prompt" button
 * beside the copy count. A successful copy calls `onCopied`, then toasts `pasteHint`.
 */
export function InstallPrompt({
  prompt,
  title,
  count,
  pasteHint,
  onCopied,
}: {
  prompt: string
  title: string
  count: number
  pasteHint: string
  onCopied: () => void
}) {
  function handleCopied() {
    onCopied()
    toast('Prompt copied', { description: pasteHint })
  }

  return (
    <Row gap={3} wrap>
      <CopyButton
        text={prompt}
        label="Copy install prompt"
        size="lg"
        variant="default"
        ariaLabel={`Copy install prompt for ${title}`}
        onCopied={handleCopied}
      />
      <CopyCount count={count} />
    </Row>
  )
}
