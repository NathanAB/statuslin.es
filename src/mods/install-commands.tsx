import { CommandRow } from '@/ui/command-row'
import { Stack } from '@/ui/layout'
import { Text } from '@/ui/text'
import { VisuallyHidden } from '@/ui/visually-hidden'
import type { InstallCommand, InstallCommandKind } from './install'

/** The mod's install commands, one compact line each, with the Claude Code versions they need. */
export function InstallCommands({
  commands,
  onCopied,
}: {
  commands: InstallCommand[]
  onCopied: (kind: InstallCommandKind) => void
}) {
  const session = commands.find((c) => c.kind === 'session')
  const shell = commands.find((c) => c.kind === 'shell')
  return (
    <Stack gap={2}>
      <VisuallyHidden as="h2">Install</VisuallyHidden>
      {commands.map((command) => (
        <CommandRow
          key={command.kind}
          label={command.label}
          command={command.command}
          onCopied={() => onCopied(command.kind)}
        />
      ))}
      {session && shell && (
        <Text muted size="xs">
          Needs Claude Code {session.minVersion} or later, or {shell.minVersion} from a shell.
        </Text>
      )}
    </Stack>
  )
}
