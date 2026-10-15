import { MOD_SAFETY_FAQ } from '@/guide/mod-safety-faq'
import { MARKETPLACE_PATH, MODS_PATH } from '@/lib/site'
import { MOD_TILE_LABEL, THROUGH_PROGRAMS } from '@/mods/mod-fact-tiles'
import { FactTable, type FactTableRow } from '@/ui/fact-table'
import { FaqSection } from '@/ui/faq-section'
import { InlineCodeText } from '@/ui/inline-code-text'
import { Stack } from '@/ui/layout'
import { NumberedList } from '@/ui/numbered-list'
import { Heading, Text, TextLink } from '@/ui/text'

/** What each footprint tile on a mod page says, per src/mods/mod-fact-tiles.ts. */
const TILES: FactTableRow[] = [
  {
    label: MOD_TILE_LABEL.usesYourPlan,
    cells: ['Yes when the mod sends its own requests to the model.'],
  },
  {
    label: MOD_TILE_LABEL.changesFiles,
    cells: ["Yes when it calls a file function that can write. Reading files doesn't count."],
  },
  { label: MOD_TILE_LABEL.network, cells: ['Yes when it makes its own web requests.'] },
  { label: MOD_TILE_LABEL.commands, cells: ['The slash commands it adds, by name, or None.'] },
]

const CHECK_IT_YOURSELF = [
  "Clone the mod's repository and check out the commit its page links.",
  'Run `claude plugin validate <path>` on the plugin folder and read its `calls:` line.',
  'Open `hooks/hooks.json` to find the module it loads, then read the hooks in that module.',
  'Find where the code calls `$.process`, `$.fs`, `$.http`, `$.env` and `$.model`, and read what it does with each.',
]

/** The /guide/are-claude-code-mods-safe page body: what a mod can touch and what checks cover. */
export function ModSafetyContent() {
  return (
    <Stack gap={6}>
      <Stack gap={3}>
        <Heading level={1}>Are Claude Code mods safe?</Heading>
        <Text muted>
          A mod runs inside Claude Code with your permissions and no sandbox. Whether it's safe
          depends on its code, and on who has read that code.
        </Text>
      </Stack>

      <Stack gap={3}>
        <Heading level={2}>What a mod can do once installed</Heading>
        <Text muted>
          <InlineCodeText text="Through `$`, Claude Code's API for mods, a mod can read and write your files, run programs, make web requests, read your environment variables, call the model on your plan, read the conversation and add slash commands. It can also approve Claude's tool calls for you. None of these asks you first." />
        </Text>
        <Text muted>
          Claude Code's sandbox covers the commands Claude runs, not a mod or the programs a mod
          starts.
        </Text>
      </Stack>

      <Stack gap={3}>
        <Heading level={2}>What claude plugin validate reports</Heading>
        <Text muted>
          <InlineCodeText text="`claude plugin validate` reads a mod's code without running it and prints its footprint: the events it hooks and the `$` calls it makes. Claude Code won't load a mod whose calls validate can't read." />
        </Text>
        <Text muted>
          statuslin.es runs it on each mod's pinned commit and shows the footprint as tiles on the
          mod page:
        </Text>
        <FactTable columns={['What it says']} rows={TILES} />
        <Text muted>
          "{THROUGH_PROGRAMS}" on {MOD_TILE_LABEL.changesFiles} or {MOD_TILE_LABEL.network} means
          the mod makes no such call itself but runs programs, and validate can't see what those
          programs do. The tiles come from the footprint, never from the page's text.
        </Text>
      </Stack>

      <Stack gap={3}>
        <Heading level={2}>What statuslin.es checks before listing a mod</Heading>
        <Text muted>
          A person reads the mod's footprint and source at a single commit. statuslin.es's
          marketplace, <TextLink href={MARKETPLACE_PATH}>{MARKETPLACE_PATH}</TextLink>, pins that
          commit, so a later push to the author's repository doesn't change what you install.
        </Text>
        <Text muted>
          An update is a new commit, and a person reviews its changes before it goes live. If the
          author deletes the pinned commit, new installs fail.
        </Text>
      </Stack>

      <Stack gap={3}>
        <Heading level={2}>What's still on you</Heading>
        <Text muted>
          Review and pinning lower the risk but guarantee nothing. A reviewer can miss something.
          Read the source before you install a mod, and again before you update it.
        </Text>
      </Stack>

      <Stack gap={3}>
        <Heading level={2}>Check a mod yourself</Heading>
        <NumberedList items={CHECK_IT_YOURSELF} />
        <Text muted>
          Or start from the <TextLink to={MODS_PATH}>reviewed mods on statuslin.es</TextLink>. Each
          page shows its tiles and links its source at the pinned commit.
        </Text>
      </Stack>

      <FaqSection entries={MOD_SAFETY_FAQ} />
    </Stack>
  )
}
