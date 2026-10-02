import { DESKTOP_GUIDE_DATES } from '@/lib/page-title'
import {
  DESKTOP_STATUS_LINE_ISSUE,
  STATUSLINE_ANYWHERE_INSTALL_COMMAND,
  STATUSLINE_ANYWHERE_MIN_CLAUDE_CODE,
} from '@/lib/statusline-anywhere'
import { BulletList } from '@/ui/bullet-list'
import { CodeBlock } from '@/ui/code-block'
import { Stack } from '@/ui/layout'
import { StatuslineAnywhereLink } from '@/ui/statusline-anywhere-link'
import { Heading, Text, TextLink } from '@/ui/text'

const LIMITS = [
  'Lines changed, PR, vim mode, prompt cache, effort and output style stay blank.',
  'Does nothing in a terminal, where Claude Code already draws the status line.',
  'No Windows support yet.',
  "Doesn't work in the VS Code extension.",
]

/** The /guide/claude-desktop page body: the plugin fix first, then its limits and the cause. */
export function DesktopGuideContent() {
  return (
    <Stack gap={6}>
      <Stack gap={3}>
        <Heading level={1}>Claude Code status line not showing in Claude Desktop</Heading>
        <Text muted measure>
          Claude Desktop doesn't run the statusLine command, so your status line never appears.{' '}
          <StatuslineAnywhereLink surface="desktop_guide" />, a Claude Code plugin, draws it above
          the prompt.
        </Text>
        <Text muted size="sm">
          Updated {DESKTOP_GUIDE_DATES.modified}
        </Text>
      </Stack>

      <Stack gap={3}>
        <Heading level={2}>Fix it</Heading>
        <Heading level={3}>1. Paste this into a terminal</Heading>
        <CodeBlock wrap text={STATUSLINE_ANYWHERE_INSTALL_COMMAND} copyLabel="Copy install command">
          {STATUSLINE_ANYWHERE_INSTALL_COMMAND}
        </CodeBlock>
        <Heading level={3}>2. Open a new Code session in Claude Desktop</Heading>
        <Text muted measure>
          Your status line shows above the prompt, in color. Needs Claude Code{' '}
          {STATUSLINE_ANYWHERE_MIN_CLAUDE_CODE} or later.
        </Text>
      </Stack>

      <Stack gap={3}>
        <Heading level={2}>Limits</Heading>
        <BulletList items={LIMITS} />
      </Stack>

      <Stack gap={3}>
        <Heading level={2}>Why it happens</Heading>
        <Text muted measure>
          Desktop doesn't support custom status lines yet. Anthropic's{' '}
          <TextLink href={DESKTOP_STATUS_LINE_ISSUE.url}>
            issue #{DESKTOP_STATUS_LINE_ISSUE.number}
          </TextLink>{' '}
          asks for it (open since {DESKTOP_STATUS_LINE_ISSUE.openedOn}).
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
