import { NOT_SHOWING_FAQ } from '@/guide/status-line-not-showing-faq'
import { DESKTOP_GUIDE_PATH, GUIDE_PATH } from '@/lib/page-title'
import { FaqSection } from '@/ui/faq-section'
import { InlineCodeText } from '@/ui/inline-code-text'
import { Stack } from '@/ui/layout'
import { NumberedList } from '@/ui/numbered-list'
import { Heading, Text, TextLink } from '@/ui/text'

/** Every fix on this page comes from this section of Anthropic's docs. */
const DOCS_TROUBLESHOOTING_URL = 'https://code.claude.com/docs/en/statusline#troubleshooting'

/** In the order the docs give them. */
const BLANK_CHECKS = [
  'Make the script executable: `chmod +x ~/.claude/statusline.sh`.',
  'Print the line to stdout, not stderr.',
  'Run the script by hand to check it prints something.',
  'On Windows with Git Bash, use forward slashes in the `command` path, since backslashes get eaten as escape characters. A path starting with `~` also works.',
  'If `disableAllHooks` is `true` outside managed settings, only a `statusLine` from managed settings runs. Remove it or set it to `false`.',
  'If your organization sets `allowManagedHooksOnly`, only a managed `statusLine` can show. Ask your admin.',
  "Run `claude --debug`. It logs the script's stderr on each run, and its exit code on the first run in a session.",
  'Ask Claude to read your settings file and run the `statusLine` command, to surface any errors.',
]

/** The /guide/status-line-not-showing page body: the terminal fixes, symptom by symptom. */
export function StatusLineNotShowingContent() {
  return (
    <Stack gap={6}>
      <Stack gap={3}>
        <Heading level={1}>Claude Code status line not showing? How to fix it</Heading>
        <Text muted>
          These fixes for Claude Code in a terminal come from{' '}
          <TextLink href={DOCS_TROUBLESHOOTING_URL}>Anthropic's status line docs</TextLink>.
        </Text>
        <Text muted>
          <InlineCodeText text="In Claude Desktop, the Code tab doesn't run your `statusLine` command at all." />{' '}
          <TextLink to={DESKTOP_GUIDE_PATH}>The Claude Desktop guide</TextLink> covers that case.
        </Text>
      </Stack>

      <Stack gap={3}>
        <Heading level={2}>The status line is blank</Heading>
        <Text muted>Work through these checks in order:</Text>
        <NumberedList items={BLANK_CHECKS} />
      </Stack>

      <Stack gap={3}>
        <Heading level={2}>You haven't trusted the folder</Heading>
        <Text muted>
          <InlineCodeText text="The status line stays blank until you accept the workspace trust dialog for the folder, or for a parent folder whose trust extends to it. `statusLine` runs a shell command, so it follows the same trust rule as hooks." />
        </Text>
        <Text muted>
          <InlineCodeText text="`claude --debug` logs `Status line command skipped: workspace trust not accepted`. Restart Claude Code and accept the dialog." />
        </Text>
      </Stack>

      <Stack gap={3}>
        <Heading level={2}>The script errors or hangs</Heading>
        <Text muted>
          Claude Code shows the output only after the script exits with code 0. A non-zero exit, or
          no output, leaves the line blank. A slow script blocks updates, and a new update cancels a
          run that hasn't finished.
        </Text>
        <Text muted>
          Test the script outside Claude Code with mock JSON on stdin. The{' '}
          <TextLink to={GUIDE_PATH}>setup guide</TextLink> shows the JSON Claude Code sends.
        </Text>
      </Stack>

      <Stack gap={3}>
        <Heading level={2}>It shows -- or empty values</Heading>
        <Text muted>
          <InlineCodeText text="Fields can be null before the first API response. Give each `jq` lookup a fallback, such as `// 0`. If values stay empty after several messages, restart Claude Code." />
        </Text>
      </Stack>

      <Stack gap={3}>
        <Heading level={2}>The context percentage differs from /context</Heading>
        <Text muted>
          <InlineCodeText text="The status line uses the token counts from the last API response, while `/context` adds an estimate for the messages since then. Use `context_window.used_percentage`." />
        </Text>
      </Stack>

      <Stack gap={3}>
        <Heading level={2}>The output looks garbled</Heading>
        <Text muted>
          Complex escape sequences can glitch when they overlap a UI update, more so in a status
          line with several lines. Try plain text.
        </Text>
      </Stack>

      <Stack gap={3}>
        <Heading level={2}>The line is cut off</Heading>
        <Text muted>
          Outside fullscreen mode, notifications share the status line's row and can cut it short in
          a narrow terminal.
        </Text>
      </Stack>

      <Stack gap={3}>
        <Heading level={2}>Turn the status line off</Heading>
        <Text muted>
          <InlineCodeText text="Run `/statusline delete`, or remove the `statusLine` field from your settings.json." />
        </Text>
      </Stack>

      <FaqSection entries={NOT_SHOWING_FAQ} />

      <Stack gap={3}>
        <Heading level={2}>Start from a working status line</Heading>
        <Text muted>
          Each status line in the gallery shows its real output before you copy it. Browse{' '}
          <TextLink to="/status-lines/$facet" params={{ facet: 'minimal' }}>
            minimal status lines
          </TextLink>
          ,{' '}
          <TextLink to="/status-lines/$facet" params={{ facet: 'token-usage' }}>
            status lines that show token usage
          </TextLink>{' '}
          or{' '}
          <TextLink to="/status-lines/$facet" params={{ facet: 'bash' }}>
            bash status lines
          </TextLink>
          , or <TextLink to={GUIDE_PATH}>set one up by hand</TextLink>.
        </Text>
      </Stack>
    </Stack>
  )
}
