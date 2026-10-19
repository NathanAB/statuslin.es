import { toast } from 'sonner'
import { CopyButton } from '@/ui/copy-button'
import { InstallCount } from '@/ui/install-count'
import { Row } from '@/ui/layout'

/**
 * The install control on status line and mod pages: the home hero's "Copy install prompt" pill
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
        size="pill"
        variant="default"
        ariaLabel={`Copy install prompt for ${title}`}
        onCopied={handleCopied}
      />
      <InstallCount count={count} />
    </Row>
  )
}
