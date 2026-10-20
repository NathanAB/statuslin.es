import { useId } from 'react'
import { toast } from 'sonner'
import { CodeBlock } from '@/ui/code-block'
import { CopyButton } from '@/ui/copy-button'
import { Panel } from '@/ui/panel'
import { Heading, Text } from '@/ui/text'

/**
 * A prompt for the visitor to paste into Claude Code, which does the page's job on their machine
 * (the troubleshooting guide's checks). The copy pill, then the prompt itself, shown open so they
 * see what they paste. A successful copy toasts `pasteHint`.
 */
export function PromptPanel({
  heading,
  lead,
  prompt,
  copyLabel,
  pasteHint,
}: {
  heading: string
  lead: string
  prompt: string
  copyLabel: string
  pasteHint: string
}) {
  const headingId = useId()
  return (
    <section aria-labelledby={headingId}>
      <Panel>
        <Heading level={2} size="compact" id={headingId}>
          {heading}
        </Heading>
        <Text muted>{lead}</Text>
        <div className="mt-2 flex flex-col items-start gap-3">
          <CopyButton
            text={prompt}
            label={copyLabel}
            size="pill"
            variant="default"
            onCopied={() => toast('Prompt copied', { description: pasteHint })}
          />
          <details open className="group w-full">
            <summary className="cursor-pointer text-muted-foreground text-sm">
              <span className="group-open:hidden">Show the prompt</span>
              <span className="hidden group-open:inline">Hide the prompt</span>
            </summary>
            <div className="mt-3">
              <CodeBlock wrap>{prompt}</CodeBlock>
            </div>
          </details>
        </div>
      </Panel>
    </section>
  )
}
