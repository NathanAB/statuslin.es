import { Package } from 'lucide-react'
import { MINIMAL_SCRIPT, MINIMAL_SCRIPT_OUTPUT, SETTINGS_SNIPPET } from '@/guide/examples'
import { GUIDE_SECTION as S } from '@/guide/guide-sections'
import type { AnsiSegment } from '@/render/types'
import { CodeBlock } from '@/ui/code-block'
import { HighlightedCode } from '@/ui/highlighted-code'
import { Hint } from '@/ui/hint'
import { InlineCommand } from '@/ui/inline-command'
import { StatuslinePreview } from '@/ui/statusline-preview'
import { StepList } from '@/ui/step-list'
import { Text, TextLink } from '@/ui/text'

const DOCS_URL = 'https://code.claude.com/docs/en/statusline'
const SCRIPT_PATH = '~/.claude/statusline.sh'
const CHMOD_COMMAND = `chmod +x ${SCRIPT_PATH}`
const TEST_COMMAND = `bash ${SCRIPT_PATH} < sample.json`

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
 * The guide's "Wire up a script by hand": save the script, make it runnable, point the settings at
 * it, test it. Each step's code sits under it; the payload the test step runs against follows the
 * steps (`GuidePayload`).
 */
export function GuideSteps({
  scriptHtml,
  settingsHtml,
}: {
  scriptHtml: string
  settingsHtml: string
}) {
  return (
    <StepList
      label="Steps"
      steps={[
        {
          ...S.saveScript,
          content: (
            <>
              <Text muted>
                Save this script to{' '}
                <Text inline mono>
                  {SCRIPT_PATH}
                </Text>
                . Three fields, one{' '}
                <Text inline mono>
                  jq
                </Text>{' '}
                call each:
              </Text>
              <HighlightedCode html={scriptHtml} text={MINIMAL_SCRIPT} copyLabel="Copy script" />
              <Hint icon={Package}>
                The script needs{' '}
                <Text inline mono>
                  jq
                </Text>
                . Install it with <InlineCommand>brew install jq</InlineCommand> on macOS, or{' '}
                <InlineCommand>sudo apt install jq</InlineCommand> on Debian and Ubuntu.
              </Hint>
            </>
          ),
        },
        {
          ...S.makeRunnable,
          content: (
            <>
              <Text muted>Mark it executable, so Claude Code can run it:</Text>
              <CodeBlock text={CHMOD_COMMAND} copyLabel="Copy chmod command">
                {CHMOD_COMMAND}
              </CodeBlock>
            </>
          ),
        },
        {
          ...S.pointSettings,
          content: (
            <>
              <Text muted>
                Point the{' '}
                <Text inline mono>
                  statusLine
                </Text>{' '}
                setting in{' '}
                <Text inline mono>
                  ~/.claude/settings.json
                </Text>{' '}
                at the script:
              </Text>
              <HighlightedCode
                html={settingsHtml}
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
            </>
          ),
        },
        {
          ...S.testIt,
          content: (
            <>
              <Text muted>
                To try it outside Claude Code, save{' '}
                <TextLink href={`#${S.payload.id}`}>the sample JSON</TextLink> below as sample.json
                and run:
              </Text>
              <CodeBlock text={TEST_COMMAND} copyLabel="Copy test command">
                {TEST_COMMAND}
              </CodeBlock>
              <Text muted size="sm">
                For that payload it prints:
              </Text>
              <StatuslinePreview segments={EXAMPLE_SEGMENTS} />
              <Text muted>This site's tests run this script on every pull request.</Text>
            </>
          ),
        },
      ]}
    />
  )
}
