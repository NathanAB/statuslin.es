import {
  STATUSLINE_ANYWHERE_INSTALL_COMMAND,
  STATUSLINE_ANYWHERE_MIN_CLAUDE_CODE,
} from '@/lib/statusline-anywhere'
import { CodeBlock } from '@/ui/code-block'
import { Stack } from '@/ui/layout'
import { StatuslineAnywhereLink } from '@/ui/statusline-anywhere-link'
import { Heading, Text, TextLink } from '@/ui/text'

/** The /guide/claude-desktop page body: the plugin fix first, then where to get a status line. */
export function DesktopGuideContent() {
  return (
    <Stack gap={6}>
      <Stack gap={3}>
        <Heading level={1}>Claude Code status line not showing in Claude Desktop</Heading>
        <Text muted measure>
          Claude Desktop doesn't run the statusLine command, so your status line never appears.{' '}
          <StatuslineAnywhereLink surface="desktop_guide" />, a Claude Code plugin, adds it back.
        </Text>
      </Stack>

      <Stack gap={3}>
        <Heading level={2}>1. Paste this into a terminal</Heading>
        <CodeBlock wrap text={STATUSLINE_ANYWHERE_INSTALL_COMMAND} copyLabel="Copy install command">
          {STATUSLINE_ANYWHERE_INSTALL_COMMAND}
        </CodeBlock>
      </Stack>

      <Stack gap={3}>
        <Heading level={2}>2. Open a new Code session in Claude Desktop</Heading>
        <Text muted measure>
          Your status line shows above the prompt, in color. Needs Claude Code{' '}
          {STATUSLINE_ANYWHERE_MIN_CLAUDE_CODE} or later.
        </Text>
      </Stack>

      <Stack gap={3}>
        <Heading level={2}>No status line yet?</Heading>
        <Text muted measure>
          <TextLink to="/">Pick one from the gallery</TextLink>, or{' '}
          <TextLink to="/guide">set one up by hand</TextLink>.
        </Text>
      </Stack>
    </Stack>
  )
}
