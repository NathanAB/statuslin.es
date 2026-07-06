import {
  MINIMAL_SCRIPT,
  MINIMAL_SCRIPT_OUTPUT,
  SAMPLE_STDIN_JSON,
  SETTINGS_SNIPPET,
} from '@/guide/examples'
import { CodeBlock } from '@/ui/code-block'
import { Stack } from '@/ui/layout'
import { Heading, Text, TextLink } from '@/ui/text'

const DOCS_URL = 'https://code.claude.com/docs/en/statusline'

/**
 * The /guide page body. All example strings live in src/guide/examples.ts, where the
 * test suite derives the payload from the render scenarios and executes the script —
 * this file is prose and layout only.
 */
export function GuideContent() {
  return (
    <Stack gap={6}>
      <Heading level={1}>How to set up a Claude Code status line</Heading>

      <Text muted measure>
        The status line is the bar at the bottom of Claude Code. When the session updates, Claude
        Code runs whatever shell script you've configured, pipes it a JSON snapshot on stdin, and
        shows whatever the script prints. That's the whole mechanism. The fast paths come first
        below, then the manual setup.
      </Text>

      <Stack gap={2}>
        <Heading level={2}>The fast paths</Heading>
        <Text muted measure>
          Run{' '}
          <Text inline mono>
            /statusline
          </Text>{' '}
          inside Claude Code and describe what you want, like{' '}
          <Text inline mono>
            /statusline show model, directory and context usage
          </Text>
          . It writes the script to{' '}
          <Text inline mono>
            ~/.claude/
          </Text>{' '}
          and updates your settings. Done. If you'd rather start from something that already looks
          good, <TextLink to="/">copy one from the gallery</TextLink>: every config there shows
          exactly what it renders before you install it.
        </Text>
      </Stack>

      <Stack gap={2}>
        <Heading level={2}>Wire up a script by hand</Heading>
        <Text muted measure>
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
        <CodeBlock>{SETTINGS_SNIPPET}</CodeBlock>
        <Text muted measure>
          Settings reload on their own, and the status line shows up on your next interaction. Two
          optional fields:{' '}
          <Text inline mono>
            padding
          </Text>{' '}
          adds horizontal spacing, and{' '}
          <Text inline mono>
            refreshInterval
          </Text>{' '}
          re-runs the script every N seconds if you show time-based data. The{' '}
          <TextLink href={DOCS_URL}>official docs</TextLink> list the rest.
        </Text>
      </Stack>

      <Stack gap={2}>
        <Heading level={2}>The JSON Claude Code sends your script</Heading>
        <Text muted measure>
          Your script gets one JSON object on stdin per update. This is a real payload, the same one
          this site renders every gallery preview against:
        </Text>
        <CodeBlock>{SAMPLE_STDIN_JSON}</CodeBlock>
        <Text muted measure>
          Most scripts only touch a few fields:{' '}
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
          . The{' '}
          <Text inline mono>
            rate_limits
          </Text>{' '}
          windows each carry a usage percentage and a{' '}
          <Text inline mono>
            resets_at
          </Text>{' '}
          unix timestamp.
        </Text>
      </Stack>

      <Stack gap={2}>
        <Heading level={2}>A minimal working script</Heading>
        <Text muted measure>
          Three fields, one{' '}
          <Text inline mono>
            jq
          </Text>{' '}
          call each:
        </Text>
        <CodeBlock>{MINIMAL_SCRIPT}</CodeBlock>
        <Text muted measure>
          For the payload above it prints{' '}
          <Text inline mono>
            {MINIMAL_SCRIPT_OUTPUT}
          </Text>
          . You can try it without opening Claude Code: save the JSON to a file and run{' '}
          <Text inline mono>
            bash statusline.sh &lt; sample.json
          </Text>
          . Our test suite runs this exact script against real payloads on every commit, so if it's
          on this page, it works.
        </Text>
      </Stack>

      <Stack gap={2}>
        <Heading level={2}>Good to know</Heading>
        <Text muted measure>
          Two things that trip people up. Git status isn't in the payload: scripts run{' '}
          <Text inline mono>
            git
          </Text>{' '}
          themselves against{' '}
          <Text inline mono>
            workspace.current_dir
          </Text>
          , which is how gallery configs show a branch even though Claude Code never sends one. And{' '}
          <Text inline mono>
            context_window.used_percentage
          </Text>{' '}
          is null at the start of a fresh session, so guard it (
          <Text inline mono>
            {'// 0'}
          </Text>{' '}
          in jq) or your status line reads "null" until the first response.
        </Text>
      </Stack>

      <Stack gap={2}>
        <Heading level={2}>Going further</Heading>
        <Text muted measure>
          Want more than a few fields? The{' '}
          <TextLink to="/resources">tools & resources list</TextLink> covers the full-featured tools
          and usage trackers. Or <TextLink to="/">copy a status line from the gallery</TextLink> and
          tweak it. If you build one you like, <TextLink to="/submit">submit it back</TextLink>.
        </Text>
      </Stack>
    </Stack>
  )
}
