import { STATUS_LINES_VS_MODS_FAQ } from '@/guide/status-lines-vs-mods-faq'
import { DESKTOP_GUIDE_PATH, GUIDE_PATH, MOD_SAFETY_GUIDE_PATH } from '@/lib/page-title'
import { MOD_ROUTE, MODS_PATH } from '@/lib/site'
import { STATUSLINE_ANYWHERE_MOD_SLUG } from '@/lib/statusline-anywhere'
import type { ModDesktopShot } from '@/mods/desktop-shot'
import { MOD_INSTALL_MIN_VERSION } from '@/mods/install'
import { FactTable, type FactTableRow } from '@/ui/fact-table'
import { FaqSection } from '@/ui/faq-section'
import { InlineCodeText } from '@/ui/inline-code-text'
import { Stack } from '@/ui/layout'
import { StatuslineAnywhereLink } from '@/ui/statusline-anywhere-link'
import { Heading, Text, TextLink } from '@/ui/text'

// No VS Code row: the mods docs say mods draw there only from extension 2.1.299 behind feature
// flags, and the status line docs don't say whether status lines show there.
const WHERE_EACH_SHOWS_UP: FactTableRow[] = [
  { label: 'Claude Code in a terminal', cells: ['Yes', 'Yes'] },
  { label: "Claude Desktop's Code tab", cells: ['No', 'Yes'] },
]

/**
 * The /guide/status-lines-vs-mods page body: what each one is, where it shows, which to pick.
 * statusline-anywhere links to its mod page once published, and to GitHub until then.
 */
export function StatusLinesVsModsContent({
  statuslineAnywhere,
}: {
  statuslineAnywhere: ModDesktopShot
}) {
  return (
    <Stack gap={6}>
      <Stack gap={3}>
        <Heading level={1}>Claude Code status lines vs mods</Heading>
        <Text muted>
          <InlineCodeText text="A status line is a script you set as `statusLine` in your settings. Claude Code pipes it a JSON snapshot of the session and prints its output at the bottom of the terminal." />
        </Text>
        <Text muted>
          A mod is a Claude Code plugin whose JavaScript or TypeScript runs inside Claude Code. It
          can draw panes and a band above the prompt, add slash commands and change how Claude Code
          behaves.
        </Text>
      </Stack>

      <Stack gap={3}>
        <Heading level={2}>Where each one shows up</Heading>
        <FactTable columns={['Status line', 'Mod']} rows={WHERE_EACH_SHOWS_UP} />
        <Text muted>
          <InlineCodeText text="Claude Desktop's Code tab never runs the `statusLine` command." />{' '}
          {statuslineAnywhere.kind === 'unpublished' ? (
            <StatuslineAnywhereLink surface="status_lines_vs_mods_guide" />
          ) : (
            <TextLink to={MOD_ROUTE} params={{ slug: STATUSLINE_ANYWHERE_MOD_SLUG }}>
              statusline-anywhere
            </TextLink>
          )}{' '}
          is a mod that runs it there and draws the output above the prompt.{' '}
          <TextLink to={DESKTOP_GUIDE_PATH}>Set it up in Claude Desktop</TextLink>.
        </Text>
      </Stack>

      <Stack gap={3}>
        <Heading level={2}>Which one to pick</Heading>
        <Text muted>
          Pick a status line for session facts at the bottom of the terminal, such as the model, git
          branch, context use and cost. A few lines of bash is enough. The{' '}
          <TextLink to={GUIDE_PATH}>guide to writing your own</TextLink> has a working script, and
          the <TextLink to="/">gallery</TextLink> shows each one's real output before you copy it.
        </Text>
        <Text muted>
          Pick a mod for what a status line can't do: a pane, a toast, a slash command, or a display
          in Claude Desktop. Mods need Claude Code {MOD_INSTALL_MIN_VERSION} or later.{' '}
          <TextLink to={MODS_PATH}>Browse mods with real previews</TextLink>.
        </Text>
        <Text muted>
          Both run with your permissions, so read the code before you install either. The{' '}
          <TextLink to={MOD_SAFETY_GUIDE_PATH}>mod safety guide</TextLink> covers what to check.
        </Text>
      </Stack>

      <FaqSection entries={STATUS_LINES_VS_MODS_FAQ} />
    </Stack>
  )
}
