import { CodeBlock } from '@/ui/code-block'
import { CopyButton } from '@/ui/copy-button'
import { Row, Stack } from '@/ui/layout'
import { Text } from '@/ui/text'
import type { InstallCommand, InstallCommandKind } from './install'

export function InstallCommandBlock({
  command,
  onCopied,
}: {
  command: InstallCommand
  onCopied: (kind: InstallCommandKind) => void
}) {
  return (
    <Stack gap={2}>
      <Row gap={3} justify="between">
        <Text size="sm">
          {command.label}{' '}
          <Text inline muted size="sm">
            (Claude Code {command.minVersion} or later)
          </Text>
        </Text>
        <CopyButton
          text={command.command}
          size="lg"
          variant="default"
          ariaLabel={`Copy command: ${command.label}`}
          onCopied={() => onCopied(command.kind)}
        />
      </Row>
      <CodeBlock wrap>{command.command}</CodeBlock>
    </Stack>
  )
}
