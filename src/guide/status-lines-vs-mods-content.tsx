import { STATUS_LINES_VS_MODS_FAQ } from '@/guide/status-lines-vs-mods-faq'
import { DESKTOP_GUIDE_PATH, GUIDE_PATH } from '@/lib/page-title'
import { MOD_ROUTE, MODS_PATH } from '@/lib/site'
import {
  STATUSLINE_ANYWHERE_MIN_CLAUDE_CODE,
  STATUSLINE_ANYWHERE_MOD_SLUG,
} from '@/lib/statusline-anywhere'
import { MOD_INSTALL_MIN_VERSION } from '@/mods/install'
import { FactTable, type FactTableRow } from '@/ui/fact-table'
import { FaqSection } from '@/ui/faq-section'
import { InlineCodeText } from '@/ui/inline-code-text'
import { Stack } from '@/ui/layout'
import { Heading, Text, TextLink } from '@/ui/text'

const WHERE_EACH_SHOWS_UP: FactTableRow[] = [
  { label: 'Claude Code in a terminal', cells: ['Yes', 'Yes'] },
  { label: "Claude Desktop's Code tab", cells: ['No', 'Yes'] },
  { label: 'The VS Code extension panel', cells: ['No', 'No'] },
]

/** The /guide/status-lines-vs-mods page body: what each one is, where it shows, which to pick. */
export function StatusLinesVsModsContent() {
  return (
    <Stack gap={6}>
      <Stack gap={3}>
        <Heading level={1}>Claude Code status lines vs mods</Heading>
        <Text muted>
          Claude Code has two ways to show your own information on screen. A status line is a script
          whose output Claude Code prints under the prompt. A mod is a plugin whose code runs inside
          Claude Code and draws its own interface.
        </Text>
      </Stack>

      <Stack gap={3}>
        <Heading level={2}>What a status line is</Heading>
        <Text muted>
          <InlineCodeText text="A status line is a command you set as `statusLine` in `~/.claude/settings.json`. Each time the line refreshes, Claude Code runs the command, sends it a JSON snapshot of the session on stdin, and shows what it prints at the bottom of the terminal." />
        </Text>
        <Text muted>
          The snapshot holds the model, the working folder, context window use, cost and rate
          limits. A working script can be a few lines of bash. The{' '}
          <TextLink to={GUIDE_PATH}>setup guide</TextLink> has one that reads three fields with{' '}
          <Text inline mono>
            jq
          </Text>
          .
        </Text>
      </Stack>

      <Stack gap={3}>
        <Heading level={2}>What a mod is</Heading>
        <Text muted>
          A mod is a Claude Code plugin with code that runs inside Claude Code. That code is a set
          of JavaScript or TypeScript functions, called hooks, that respond to session events and
          return what to draw.
        </Text>
        <Text muted>
          A mod can draw a band above the prompt, a line under it, a pane or a toast, and it can add
          slash commands. Mods draw in the terminal and in Claude Desktop on Claude Code{' '}
          {MOD_INSTALL_MIN_VERSION} or later.{' '}
          <TextLink to={MODS_PATH}>Browse mods with real previews</TextLink>.
        </Text>
      </Stack>

      <Stack gap={3}>
        <Heading level={2}>Where each one shows up</Heading>
        <FactTable columns={['Status line', 'Mod']} rows={WHERE_EACH_SHOWS_UP} />
        <Text muted>
          <InlineCodeText text="Claude Desktop's Code tab never runs the `statusLine` command, so a status line you set up for the terminal doesn't appear there." />{' '}
          <TextLink to={DESKTOP_GUIDE_PATH}>Here's how to show it in Claude Desktop</TextLink>.
        </Text>
      </Stack>

      <Stack gap={3}>
        <Heading level={2}>Which one to pick</Heading>
        <Text muted>
          Pick a status line when you want session facts at the bottom of the terminal, such as the
          model, git branch, context use and cost. It works in any terminal Claude Code runs in. The{' '}
          <TextLink to="/">gallery</TextLink> shows each one's real output before you copy it.
        </Text>
        <Text muted>
          Pick a mod when you want something a status line can't do: a pane, a toast, a slash
          command, or a display in Claude Desktop.
        </Text>
        <Text muted>
          Both run on your machine with your permissions, so read the code before you install
          either. A status line is one script. A mod is a plugin folder with a manifest, a hooks
          file and the code that file loads.
        </Text>
      </Stack>

      <Stack gap={3}>
        <Heading level={2}>Your status line in Claude Desktop</Heading>
        <Text muted>
          You can keep your status line and still see it in Desktop.{' '}
          <TextLink to={MOD_ROUTE} params={{ slug: STATUSLINE_ANYWHERE_MOD_SLUG }}>
            statusline-anywhere
          </TextLink>{' '}
          is a mod that runs your{' '}
          <Text inline mono>
            statusLine
          </Text>{' '}
          command and draws its output above the prompt in Claude Desktop, in color. It draws
          nothing in the terminal, where Claude Code already shows your status line. It needs Claude
          Code {STATUSLINE_ANYWHERE_MIN_CLAUDE_CODE} or later.
        </Text>
        <Text muted>
          The <TextLink to={DESKTOP_GUIDE_PATH}>Claude Desktop guide</TextLink> has the install
          command.
        </Text>
      </Stack>

      <FaqSection entries={STATUS_LINES_VS_MODS_FAQ} />
    </Stack>
  )
}
