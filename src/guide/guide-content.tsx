import {
  MINIMAL_SCRIPT,
  MINIMAL_SCRIPT_OUTPUT,
  SAMPLE_STDIN_JSON,
  SETTINGS_SNIPPET,
} from '@/guide/examples'
import { GUIDE_FAQ } from '@/guide/guide-faq'
import { GuideStdinFields } from '@/guide/guide-stdin-fields'
import {
  GUIDE_DATES,
  NOT_SHOWING_GUIDE_PATH,
  STATUS_LINES_VS_MODS_GUIDE_PATH,
} from '@/lib/page-title'
import type { AnsiSegment } from '@/render/types'
import { Card, CardContent, CardHeader, CardTitle } from '@/ui/card'
import { FaqSection } from '@/ui/faq-section'
import { HighlightedCode } from '@/ui/highlighted-code'
import { Grid, Stack } from '@/ui/layout'
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
          A status line is a bar at the bottom of Claude Code. Claude Code runs your script, pipes
          it a JSON snapshot of the session, and shows what the script prints.
        </Text>
        <Text muted size="sm">
          Updated {GUIDE_DATES.modified}
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
                and updates your settings.
              </Text>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Copy from the gallery</CardTitle>
            </CardHeader>
            <CardContent>
              <Text muted size="sm">
                Each status line there shows its real output before you copy it.{' '}
                <TextLink to="/">Browse Claude Code status lines</TextLink>.
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
              , run{' '}
              <Text inline mono>
                chmod +x ~/.claude/statusline.sh
              </Text>
              , and point the{' '}
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
              Claude Code runs the script as soon as you save. Two optional fields:{' '}
              <Text inline mono>
                padding
              </Text>{' '}
              indents the line by N characters, and{' '}
              <Text inline mono>
                refreshInterval
              </Text>{' '}
              re-runs the script every N seconds, for a clock or other live data. The{' '}
              <TextLink href={DOCS_URL}>official docs</TextLink> list the rest.
            </Text>
          </Stack>

          <Stack gap={3}>
            <Heading level={3}>The JSON your script receives</Heading>
            <Text muted>
              Your script gets one JSON object on stdin per update. This is one of the payloads the
              gallery renders previews against:
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
              . Browse status lines that show{' '}
              <TextLink to="/status-lines/$facet" params={{ facet: 'token-usage' }}>
                token usage
              </TextLink>
              ,{' '}
              <TextLink to="/status-lines/$facet" params={{ facet: 'quota' }}>
                usage limits
              </TextLink>{' '}
              or{' '}
              <TextLink to="/status-lines/$facet" params={{ facet: 'git' }}>
                git status
              </TextLink>
              .
            </Text>
            <GuideStdinFields />
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
              To try it outside Claude Code, save the JSON above as sample.json and run{' '}
              <Text inline mono>
                bash statusline.sh &lt; sample.json
              </Text>
              . This site's tests run this script on every commit.
            </Text>
          </Stack>
        </Stack>
      </SectionCard>

      <FaqSection entries={GUIDE_FAQ} />

      <Stack gap={3}>
        <Heading level={2}>Going further</Heading>
        <Text muted>
          The <TextLink to="/resources">tools and resources list</TextLink> has themes and usage
          trackers. If you build a status line you like,{' '}
          <TextLink to="/submit">submit it to the gallery</TextLink>.
        </Text>
        <Text muted>
          Status line blank in the terminal?{' '}
          <TextLink to={NOT_SHOWING_GUIDE_PATH}>Work through the fixes</TextLink>.
        </Text>
        <Text muted>
          Claude Desktop's Code tab doesn't run your status line.{' '}
          <TextLink to="/guide/claude-desktop">Here's how to show it there</TextLink>.
        </Text>
        <Text muted>
          For a pane or a slash command, you need a mod.{' '}
          <TextLink to={STATUS_LINES_VS_MODS_GUIDE_PATH}>Compare status lines and mods</TextLink>.
        </Text>
      </Stack>
    </Stack>
  )
}
