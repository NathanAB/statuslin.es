import { Link } from '@tanstack/react-router'
import { NOT_SHOWING_GUIDE_PATH } from '@/lib/page-title'
import { MOD_ROUTE } from '@/lib/site'
import {
  STATUSLINE_ANYWHERE_MIN_CLAUDE_CODE,
  STATUSLINE_ANYWHERE_MOD_SLUG,
  STATUSLINE_ANYWHERE_URL,
} from '@/lib/statusline-anywhere'
import type { ModDesktopShot } from '@/mods/desktop-shot'
import { Button } from '@/ui/button'
import { DesktopShot } from '@/ui/desktop-shot'
import { Row, Stack } from '@/ui/layout'
import { StatuslineAnywhereLink } from '@/ui/statusline-anywhere-link'
import { Heading, Text, TextLink } from '@/ui/text'

/**
 * The /guide/claude-desktop page body: the plugin fix first, then where to get a status line.
 * `statuslineAnywhere` says whether that mod's page exists to link, and its Desktop screenshot.
 */
export function DesktopGuideContent({
  statuslineAnywhere,
}: {
  statuslineAnywhere: ModDesktopShot
}) {
  return (
    <Stack gap={6}>
      <Stack gap={3}>
        <Heading level={1}>Claude Code status line not showing in Claude Desktop</Heading>
        <Text muted>
          Claude Desktop doesn't run the statusLine command, so your status line never appears.{' '}
          <StatuslineAnywhereLink surface="desktop_guide" />, a Claude Code mod, adds it back.
        </Text>
        <Text muted>
          Missing in the terminal too? See{' '}
          <TextLink to={NOT_SHOWING_GUIDE_PATH}>the terminal fixes</TextLink>.
        </Text>
      </Stack>

      <Stack gap={3}>
        <Heading level={2}>1. Install the mod</Heading>
        {/* Its mod page holds the counted install prompt; before it's published, the repo. */}
        <Row gap={2}>
          <Button asChild>
            {statuslineAnywhere.kind === 'unpublished' ? (
              <a href={STATUSLINE_ANYWHERE_URL} target="_blank" rel="noopener noreferrer">
                Install statusline-anywhere
              </a>
            ) : (
              <Link to={MOD_ROUTE} params={{ slug: STATUSLINE_ANYWHERE_MOD_SLUG }}>
                Install statusline-anywhere
              </Link>
            )}
          </Button>
        </Row>
      </Stack>

      <Stack gap={3}>
        <Heading level={2}>2. Open a new Code session in Claude Desktop</Heading>
        <Text muted>
          Your status line shows above the prompt, in color. Needs Claude Code{' '}
          {STATUSLINE_ANYWHERE_MIN_CLAUDE_CODE} or later.
          {statuslineAnywhere.kind === 'no-shot' && (
            <>
              {' '}
              <TextLink to={MOD_ROUTE} params={{ slug: STATUSLINE_ANYWHERE_MOD_SLUG }}>
                See a screenshot
              </TextLink>
              .
            </>
          )}
        </Text>
        {statuslineAnywhere.kind === 'shot' && (
          <>
            <DesktopShot
              shot={statuslineAnywhere.shot}
              alt="statusline-anywhere in Claude Desktop"
              fit="whole"
            />
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
