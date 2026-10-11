import { CommandRow } from '@/ui/command-row'
import { Stack } from '@/ui/layout'
import { Heading, Text } from '@/ui/text'
import { type InstallCommand, type InstallCommandKind, MOD_INSTALL_MIN_VERSION } from './install'

/** The mod's install commands, one compact line each, and the Claude Code version installing needs. */
export function InstallCommands({
  commands,
  onCopied,
}: {
  commands: InstallCommand[]
  onCopied: (kind: InstallCommandKind) => void
}) {
  return (
    <Stack gap={2}>
      <Heading level={2}>Install</Heading>
      {commands.map((command) => (
        <CommandRow
          key={command.kind}
          label={command.label}
          command={command.command}
          onCopied={() => onCopied(command.kind)}
        />
      ))}
      <Text muted size="xs">
        Needs Claude Code {MOD_INSTALL_MIN_VERSION} or later.
      </Text>
    </Stack>
  )
}
