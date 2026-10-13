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
  'Run `claude plugin validate <path>` on the plugin folder. Add `--json` for a JSON report.',
  'Open `hooks/hooks.json` to find the module it loads, then read the hooks in that module.',
  'Search the code for `$.process`, `$.fs`, `$.http` and `$.model` calls.',
  "Look for `eval` and a global `fetch` too. Validate doesn't list either one as a call.",
]

/** The /guide/are-claude-code-mods-safe page body: what a mod can touch and what checks cover. */
export function ModSafetyContent() {
  return (
    <Stack gap={6}>
      <Stack gap={3}>
        <Heading level={1}>Are Claude Code mods safe?</Heading>
        <Text muted>
          A mod runs inside Claude Code with your permissions, so whether it's safe depends on its
          code. This page covers what a mod can do once installed, what statuslin.es checks before
          it lists one, and what is still up to you.
        </Text>
      </Stack>

      <Stack gap={3}>
        <Heading level={2}>What a mod can do once installed</Heading>
        <Text muted>
          Claude Code doesn't sandbox mods. A mod's file and process calls run without asking you
          first. Its web requests follow only your organization's web-fetch policy, and a program it
          starts runs outside Claude Code's Bash sandbox.
        </Text>
        <Text muted>
          <InlineCodeText text="Through `$`, Claude Code's API for mods, a mod can read and write files, run programs, make web requests, send its own requests to the model, read the conversation and add slash commands." />
        </Text>
        <Text muted>
          <InlineCodeText text="Claude Code's install step shows a generic trust warning. It doesn't list what the mod calls. That list, called the footprint, appears only when you run `claude plugin validate`." />
        </Text>
      </Stack>

      <Stack gap={3}>
        <Heading level={2}>What claude plugin validate reports</Heading>
        <Text muted>
          <InlineCodeText text="`claude plugin validate` reads a mod's code without running it. It prints the footprint: the events the mod hooks and the calls it makes on `$`. It rejects code that hides a call, such as aliasing `$`, reaching it through a computed name, or a dynamic `import()`." />
        </Text>
        <Text muted>
          statuslin.es runs it in a sandbox on each mod's pinned commit and turns the footprint into
          tiles on the mod page:
        </Text>
        <FactTable columns={['What it says']} rows={TILES} />
        <Text muted>
          "{THROUGH_PROGRAMS}" on {MOD_TILE_LABEL.changesFiles} or {MOD_TILE_LABEL.network} means
          the mod makes no such call itself, but it runs programs. Validate can't see what those
          programs do.
        </Text>
        <Text muted>
          The page text never decides a tile. It can describe a yes in more detail, but the yes or
          no comes from the footprint.
        </Text>
      </Stack>

      <Stack gap={3}>
        <Heading level={2}>Pinned to the commit a person reviewed</Heading>
        <Text muted>
          statuslin.es serves its own marketplace at{' '}
          <TextLink href={MARKETPLACE_PATH}>{MARKETPLACE_PATH}</TextLink>. Each entry names the
          author's repository and the commit a person reviewed. Claude Code installs that commit, so
          a later push to the author's repository doesn't change what you get.
        </Text>
        <Text muted>
          If the author force-pushes over that commit or deletes it, new installs fail. An update is
          a new version at a new commit. A person reviews it, including the changes since the live
          commit, before it replaces the live version.
        </Text>
      </Stack>

      <Stack gap={3}>
        <Heading level={2}>Read by a person before it's listed</Heading>
        <Text muted>
          Before a mod appears on statuslin.es, a person reads its footprint and its source at the
          pinned commit. statuslin.es also runs the mod in a sandbox, in the terminal and in Claude
          Desktop, to record the previews on its page. Each mod page links its source at that
          commit, next to the author and the licence.
        </Text>
      </Stack>

      <Stack gap={3}>
        <Heading level={2}>What's still on you</Heading>
        <Text muted>
          Review and pinning lower the risk. They don't guarantee anything. A reviewer can miss
          something, and the sandbox only covers the preview run. Once installed, the mod runs on
          your machine.
        </Text>
        <Text muted>
          A mod that runs programs can do whatever those programs do. The footprint shows that it
          runs them, not what they do. Read the source before you install a mod, and again before
          you update it.
        </Text>
      </Stack>

      <Stack gap={3}>
        <Heading level={2}>Check a mod yourself</Heading>
        <NumberedList items={CHECK_IT_YOURSELF} />
        <Text muted>
          Or start from the <TextLink to={MODS_PATH}>reviewed mods on statuslin.es</TextLink>, each
          with its tiles and a link to its source at the pinned commit.
        </Text>
      </Stack>

      <FaqSection entries={MOD_SAFETY_FAQ} />
    </Stack>
  )
}
