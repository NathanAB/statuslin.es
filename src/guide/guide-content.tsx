import {
  MINIMAL_SCRIPT,
  MINIMAL_SCRIPT_OUTPUT,
  SAMPLE_STDIN_JSON,
  SETTINGS_SNIPPET,
} from '@/guide/examples'
import type { AnsiSegment } from '@/render/types'
import { Card, CardContent, CardHeader, CardTitle } from '@/ui/card'
import { HighlightedCode } from '@/ui/highlighted-code'
import { Grid, Stack } from '@/ui/layout'
import { Notice } from '@/ui/notice'
import { SectionCard } from '@/ui/section-card'
import { StatuslinePreview } from '@/ui/statusline-preview'
import { Heading, Text, TextLink } from '@/ui/text'

const DOCS_URL = 'https://code.claude.com/docs/en/statusline'

const EXAMPLE_SEGMENTS: AnsiSegment[] = [
  {
    text: MINIMAL_SCRIPT_OUTPUT,
    fg: null,
    bg: null,
    bold: false,
    italic: false,
    underline: false,
  },
]

/**
 * The /guide page body. Example strings live in src/guide/examples.ts; this file is
 * prose and layout. Code blocks are pre-highlighted server-side and passed in as `highlights`.
 */
export function GuideContent({
  highlights,
}: {
  highlights: { payloadHtml: string; scriptHtml: string; settingsHtml: string }
}) {
  return (
    <Stack gap={6}>
      <Stack gap={3}>
        <Heading level={1}>How to set up a Claude Code status line</Heading>
        <Text muted>
          The status line is the bar at the bottom of Claude Code. Each time it refreshes, Claude
          Code runs your shell script, sends it a JSON snapshot on stdin, and shows whatever the
          script prints. Start with a fast path, or skip to wiring a script by hand.
        </Text>
      </Stack>

      <Stack gap={3}>
        <Heading level={2}>The fast paths</Heading>
        <Grid>
          <Card>
            <CardHeader>
              <CardTitle>Run /statusline</CardTitle>
            </CardHeader>
            <CardContent>
              <Text muted size="sm">
                Inside Claude Code, describe what you want, like{' '}
                <Text inline mono>
                  /statusline show model, directory, and context usage
                </Text>
                . It writes the script to{' '}
                <Text inline mono>
                  ~/.claude/
                </Text>{' '}
                and updates your settings. Done.
              </Text>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Copy from the gallery</CardTitle>
            </CardHeader>
            <CardContent>
              <Text muted size="sm">
                Every config shows exactly what it renders before you install it.{' '}
                <TextLink to="/">Browse the gallery</TextLink>.
              </Text>
            </CardContent>
          </Card>
        </Grid>
      </Stack>

      <SectionCard title="Wire up a script by hand" headingLevel={2}>
        <Stack gap={6}>
          <Stack gap={3}>
            <Text muted>
              Save a script to{' '}
              <Text inline mono>
                ~/.claude/statusline.sh
              </Text>
              , make it executable (
              <Text inline mono>
                chmod +x ~/.claude/statusline.sh
              </Text>
              ), and point the{' '}
              <Text inline mono>
                statusLine
              </Text>{' '}
              setting in{' '}
              <Text inline mono>
                ~/.claude/settings.json
              </Text>{' '}
              at it:
            </Text>
            <HighlightedCode
              html={highlights.settingsHtml}
              text={SETTINGS_SNIPPET}
              copyLabel="Copy settings"
            />
            <Text muted>
              Claude Code reloads settings on its own. The status line appears on your next message.
              Two optional fields:{' '}
              <Text inline mono>
                padding
              </Text>{' '}
              adds horizontal space so the line isn't flush with the edge, and{' '}
              <Text inline mono>
                refreshInterval
              </Text>{' '}
              re-runs the script every N seconds if you show a clock or other live data. The{' '}
              <TextLink href={DOCS_URL}>official docs</TextLink> list the rest.
            </Text>
          </Stack>

          <Stack gap={3}>
            <Heading level={3}>The JSON your script receives</Heading>
            <Text muted>
              Your script gets one JSON object on stdin per update. This is a real payload, the same
              one this site uses to render every gallery preview:
            </Text>
            <HighlightedCode
              html={highlights.payloadHtml}
              text={SAMPLE_STDIN_JSON}
              copyLabel="Copy JSON"
            />
            <Text muted>
              Most scripts only need a few fields:{' '}
              <Text inline mono>
                model.display_name
              </Text>
              ,{' '}
              <Text inline mono>
                workspace.current_dir
              </Text>
              ,{' '}
              <Text inline mono>
                context_window.used_percentage
              </Text>
              , and{' '}
              <Text inline mono>
                cost.total_cost_usd
              </Text>
              . Each{' '}
              <Text inline mono>
                rate_limits
              </Text>{' '}
              window has a usage percentage and a{' '}
              <Text inline mono>
                resets_at
              </Text>{' '}
              unix timestamp.
            </Text>
          </Stack>

          <Stack gap={3}>
            <Heading level={3}>A minimal working script</Heading>
            <Text muted>
              Three fields, one{' '}
              <Text inline mono>
                jq
              </Text>{' '}
              call each:
            </Text>
            <HighlightedCode
              html={highlights.scriptHtml}
              text={MINIMAL_SCRIPT}
              copyLabel="Copy script"
            />
            <Text muted size="sm">
              For the payload above it prints:
            </Text>
            <StatuslinePreview segments={EXAMPLE_SEGMENTS} />
            <Text muted>
              You can try it without opening Claude Code: save that JSON to a file and run{' '}
              <Text inline mono>
                bash statusline.sh &lt; sample.json
              </Text>
              . This repo's tests run that exact script against real payloads on every commit.
            </Text>
          </Stack>
        </Stack>
      </SectionCard>

      <Stack gap={3}>
        <Heading level={2}>Two pitfalls</Heading>
        <Notice tone="info">
          Git status isn't in the payload. Scripts that show a branch run{' '}
          <Text inline mono>
            git
          </Text>{' '}
          themselves against{' '}
          <Text inline mono>
            workspace.current_dir
          </Text>
          . That's how gallery configs do it, even though Claude Code never sends a branch.
        </Notice>
        <Notice tone="info">
          <Text inline mono>
            context_window.used_percentage
          </Text>{' '}
          is null at the start of a fresh session. Guard it (
          <Text inline mono>
            {'// 0'}
          </Text>{' '}
          in jq) or the bar reads "null" until the first response.
        </Notice>
      </Stack>

      <Stack gap={3}>
        <Heading level={2}>Going further</Heading>
        <Text muted>
          Want more than a few fields? The{' '}
          <TextLink to="/resources">tools & resources list</TextLink> has themes, widgets, and usage
          trackers. Or <TextLink to="/">copy a status line from the gallery</TextLink> and tweak it.
          If you build one you like, <TextLink to="/submit">submit it to the gallery</TextLink>.
        </Text>
      </Stack>
    </Stack>
  )
}
