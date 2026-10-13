import { MOD_ROUTE } from '@/lib/site'
import {
  STATUSLINE_ANYWHERE_INSTALL_COMMAND,
  STATUSLINE_ANYWHERE_MIN_CLAUDE_CODE,
  STATUSLINE_ANYWHERE_MOD_SLUG,
} from '@/lib/statusline-anywhere'
import { CodeBlock } from '@/ui/code-block'
import { DesktopShot, type DesktopShotImage } from '@/ui/desktop-shot'
import { Stack } from '@/ui/layout'
import { StatuslineAnywhereLink } from '@/ui/statusline-anywhere-link'
import { Heading, Text, TextLink } from '@/ui/text'

/**
 * The /guide/claude-desktop page body: the plugin fix first, then where to get a status line.
 * `shot` is statusline-anywhere's recorded Claude Desktop preview, or null while there is none.
 */
export function DesktopGuideContent({ shot }: { shot: DesktopShotImage | null }) {
  return (
    <Stack gap={6}>
      <Stack gap={3}>
        <Heading level={1}>Claude Code status line not showing in Claude Desktop</Heading>
        <Text muted>
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
        <Text muted>
          Your status line shows above the prompt, in color. Needs Claude Code{' '}
          {STATUSLINE_ANYWHERE_MIN_CLAUDE_CODE} or later.
          {shot === null && (
            <>
              {' '}
              <TextLink to={MOD_ROUTE} params={{ slug: STATUSLINE_ANYWHERE_MOD_SLUG }}>
                See a screenshot
              </TextLink>
              .
            </>
          )}
        </Text>
        {shot !== null && (
          <>
            <DesktopShot shot={shot} alt="statusline-anywhere in Claude Desktop" fit="whole" />
            <Text muted size="sm">
              statusline-anywhere in a real Claude Desktop session, recorded by statuslin.es.{' '}
              <TextLink to={MOD_ROUTE} params={{ slug: STATUSLINE_ANYWHERE_MOD_SLUG }}>
                See its mod page
              </TextLink>
              .
            </Text>
          </>
        )}
      </Stack>

      <Stack gap={3}>
        <Heading level={2}>No status line yet?</Heading>
        <Text muted>
          <TextLink to="/">Pick one from the gallery</TextLink>, or{' '}
          <TextLink to="/guide">set one up by hand</TextLink>.
        </Text>
      </Stack>
    </Stack>
  )
}
