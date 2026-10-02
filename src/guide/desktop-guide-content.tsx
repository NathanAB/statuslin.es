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
  'Your statusLine script runs as it is, and its colors show.',
  "Plugins can't see lines changed, PR, vim mode, prompt cache, effort or output style, so those parts of a status line stay blank in Desktop.",
  'It does nothing in a terminal, where Claude Code already draws the status line.',
  'No Windows support yet.',
  "It doesn't help in the VS Code extension: plugin drawings don't appear in that panel.",
]

/** The /guide/claude-desktop page body: why Desktop hides status lines, and the plugin fix. */
export function DesktopGuideContent() {
  return (
    <Stack gap={6}>
      <Stack gap={3}>
        <Heading level={1}>Claude Code status line not showing in Claude Desktop</Heading>
        <Text muted measure>
          Your status line works in a terminal but not in the Code tab of Claude Desktop. Nothing is
          wrong with your script.
        </Text>
        <Text muted size="sm">
          Updated {DESKTOP_GUIDE_DATES.modified}
        </Text>
      </Stack>

      <Stack gap={3}>
        <Heading level={2}>Why it happens</Heading>
        <Text muted measure>
          Claude Desktop doesn't run the statusLine command from your settings, so a custom status
          line never shows in its Code tab. Anthropic's{' '}
          <TextLink href={DESKTOP_STATUS_LINE_ISSUE.url}>
            issue #{DESKTOP_STATUS_LINE_ISSUE.number}
          </TextLink>{' '}
          asks for it and has been open since {DESKTOP_STATUS_LINE_ISSUE.openedOn}.
        </Text>
      </Stack>

      <Stack gap={3}>
        <Heading level={2}>The fix</Heading>
        <Text muted measure>
          <StatuslineAnywhereLink surface="desktop_guide" /> is a Claude Code plugin. It runs the
          statusLine command you already have and draws the output above the prompt in the Desktop
          Code tab, in color. Paste this into a terminal:
        </Text>
        <CodeBlock wrap text={STATUSLINE_ANYWHERE_INSTALL_COMMAND} copyLabel="Copy install command">
          {STATUSLINE_ANYWHERE_INSTALL_COMMAND}
        </CodeBlock>
        <Text muted measure>
          Then open a new Code session in Claude Desktop. Your status line is above the prompt. It
          needs Claude Code {STATUSLINE_ANYWHERE_MIN_CLAUDE_CODE} or later.
        </Text>
      </Stack>

      <Stack gap={3}>
        <Heading level={2}>What works and what doesn't</Heading>
        <BulletList items={LIMITS} />
      </Stack>

      <Stack gap={3}>
        <Heading level={2}>No status line yet?</Heading>
        <Text muted measure>
          The plugin shows the status line you already use.{' '}
          <TextLink to="/">Pick one from the gallery</TextLink> and copy its install prompt, or{' '}
          <TextLink to="/guide">set one up by hand</TextLink>.
        </Text>
      </Stack>
    </Stack>
  )
}
