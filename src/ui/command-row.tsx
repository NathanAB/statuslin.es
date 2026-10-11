import { CopyButton } from '@/ui/copy-button'
import { Text } from '@/ui/text'

/**
 * One labelled shell command on a single line with a loud Copy button. A long command is cut
 * off with an ellipsis on screen; the copy and screen readers still get all of it. On a narrow
 * screen the label takes its own line above the command.
 */
export function CommandRow({
  label,
  command,
  onCopied,
}: {
  label: string
  command: string
  onCopied: () => void
}) {
  return (
    <div
      data-slot="command-row"
      className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md bg-sunken py-1.5 pr-1.5 pl-3"
    >
      <span className="w-full text-muted-foreground text-sm sm:w-28 sm:shrink-0">{label}</span>
      <span className="min-w-0 flex-1 truncate">
        <Text mono size="sm" inline>
          {command}
        </Text>
      </span>
      <CopyButton
        text={command}
        variant="default"
        ariaLabel={`Copy command: ${label}`}
        onCopied={onCopied}
      />
    </div>
  )
}
