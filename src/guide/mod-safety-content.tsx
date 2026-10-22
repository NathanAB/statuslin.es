import {
  BookOpen,
  CircleCheck,
  CircleX,
  Coins,
  EyeOff,
  FilePen,
  GitCommitHorizontal,
  Globe,
  MessagesSquare,
  Pin,
  RefreshCw,
  ShieldAlert,
  ShieldOff,
  SquareSlash,
  Terminal,
  Variable,
} from 'lucide-react'
import { MOD_SAFETY_FAQ } from '@/guide/mod-safety-faq'
import { HOW_IT_WORKS_HEADING, HOW_IT_WORKS_PATH } from '@/lib/page-title'
import { MARKETPLACE_PATH, MODS_PATH } from '@/lib/site'
import { MOD_TILE_LABEL, THROUGH_PROGRAMS } from '@/mods/mod-fact-tiles'
import { Callout } from '@/ui/callout'
import { DocLayout } from '@/ui/doc-layout'
import { FactTable, type FactTableRow } from '@/ui/fact-table'
import { FaqSection } from '@/ui/faq-section'
import { IconList, type IconListItem } from '@/ui/icon-list'
import { InlineCodeText } from '@/ui/inline-code-text'
import { Grid, Stack } from '@/ui/layout'
import { PageHeader } from '@/ui/page-header'
import { PageSection, SectionAnchor } from '@/ui/page-section'
import { Panel } from '@/ui/panel'
import { type Step, StepList } from '@/ui/step-list'
import { Text, TextLink } from '@/ui/text'

/** Each section's heading and the id a link like /guide/are-claude-code-mods-safe#its-id lands on. */
const SECTION = {
  canDo: { id: 'what-a-mod-can-do-once-installed', title: 'What a mod can do once installed' },
  validate: {
    id: 'what-claude-plugin-validate-reports',
    title: 'What claude plugin validate reports',
  },
  checks: {
    id: 'what-statuslines-checks-before-listing-a-mod',
    title: 'What statuslin.es checks before listing a mod',
  },
  onYou: { id: 'whats-still-on-you', title: "What's still on you" },
  checkYourself: { id: 'check-a-mod-yourself', title: 'Check a mod yourself' },
  // The FAQ's heading is drawn by FaqSection; this is the anchor around it.
  faq: { id: 'common-questions', title: 'Common questions' },
} as const

/** What `$` lets a mod do, in the order the docs give it. */
const CAN_DO: IconListItem[] = [
  { icon: FilePen, text: 'Reads and writes your files' },
  { icon: Terminal, text: 'Runs programs' },
  { icon: Globe, text: 'Makes web requests' },
  { icon: Variable, text: 'Reads your environment variables' },
  { icon: Coins, text: 'Calls Claude on your plan' },
  { icon: MessagesSquare, text: 'Reads the conversation' },
  { icon: SquareSlash, text: 'Adds slash commands' },
  { icon: CircleCheck, text: "Approves Claude's tool calls for you" },
]

/** What each footprint tile on a mod page says, per src/mods/mod-fact-tiles.ts. */
const TILES: FactTableRow[] = [
  {
    label: MOD_TILE_LABEL.usesYourPlan,
    cells: ['Yes when the mod sends its own requests to Claude.'],
  },
  {
    label: MOD_TILE_LABEL.changesFiles,
    cells: ["Yes when it calls a file function that can write. Reading files doesn't count."],
  },
  { label: MOD_TILE_LABEL.network, cells: ['Yes when it makes its own web requests.'] },
  { label: MOD_TILE_LABEL.commands, cells: ['The slash commands it adds, by name, or None.'] },
]

const CHECKS: IconListItem[] = [
  {
    icon: GitCommitHorizontal,
    text: 'Each mod is reviewed at one commit: its footprint and its source.',
  },
  {
    icon: Pin,
    text: (
      <>
        statuslin.es's marketplace, <TextLink href={MARKETPLACE_PATH}>{MARKETPLACE_PATH}</TextLink>,
        pins that commit, so a later push to the author's repository doesn't change what you
        install.
      </>
    ),
  },
  {
    icon: RefreshCw,
    text: 'An update is a new commit, and its changes are reviewed before it goes live.',
  },
  { icon: CircleX, text: 'If the author deletes the pinned commit, new installs fail.' },
]

const ON_YOU: IconListItem[] = [
  { icon: ShieldAlert, text: 'Review and pinning lower the risk but guarantee nothing.' },
  { icon: EyeOff, text: 'A reviewer can miss something.' },
  {
    icon: BookOpen,
    text: 'Read the source before you install a mod, and again before you update it.',
  },
]

const step = (id: string, title: string, text: string): Step => ({
  id,
  title,
  content: (
    <Text>
      <InlineCodeText text={text} />
    </Text>
  ),
})

const CHECK_IT_YOURSELF: Step[] = [
  step(
    'clone-the-mods-repository',
    "Clone the mod's repository",
    'Check out the commit its page links.',
  ),
  step(
    'read-its-footprint',
    'Read its footprint',
    'Run `claude plugin validate <path>` on the plugin folder and read its `calls:` line.',
  ),
  step(
    'read-its-hooks',
    'Read its hooks',
    'Open `hooks/hooks.json` to find the module it loads, then read the hooks in that module.',
  ),
  step(
    'trace-its-calls',
    'Trace its calls',
    'Find where the code calls `$.process`, `$.fs`, `$.http`, `$.env` and `$.model`, and read what it does with each.',
  ),
]

/** The /guide/are-claude-code-mods-safe page body: what a mod can touch and what checks cover. */
export function ModSafetyContent() {
  return (
    <DocLayout
      contents={Object.values(SECTION)}
      intro={
        <PageHeader
          title="Are Claude Code mods safe?"
          lead="A mod runs inside Claude Code with your permissions and no sandbox. Whether it's safe depends on its code, and on who has read that code."
        />
      }
    >
      <Stack gap={9}>
        <PageSection id={SECTION.canDo.id} title={SECTION.canDo.title}>
          <Text>
            <InlineCodeText text="Through `$`, Claude Code's API for mods, a mod can:" />
          </Text>
          <IconList label="What a mod can do" look="tiles" items={CAN_DO} />
          <Callout
            title="None of these asks you first"
            icon={<ShieldOff aria-hidden="true" />}
            description="Claude Code's sandbox covers the commands Claude runs, not a mod or the programs a mod starts."
          />
        </PageSection>

        <PageSection id={SECTION.validate.id} title={SECTION.validate.title}>
          <Text>
            <InlineCodeText text="`claude plugin validate` reads a mod's code without running it and prints its footprint: the events it hooks and the `$` calls it makes. Claude Code won't load a mod whose calls validate can't read." />
          </Text>
          <Text>
            statuslin.es runs it on each mod's pinned commit and shows the footprint as tiles on the
            mod page:
          </Text>
          <FactTable columns={['What it says']} rows={TILES} />
          <Text muted>
            "{THROUGH_PROGRAMS}" on {MOD_TILE_LABEL.changesFiles} or {MOD_TILE_LABEL.network} means
            the mod makes no such call itself but runs programs, and validate can't see what those
            programs do. The tiles come from the footprint, never from the page's text.
          </Text>
        </PageSection>

        <Grid>
          <Panel>
            <PageSection id={SECTION.checks.id} title={SECTION.checks.title}>
              <IconList label="What statuslin.es checks" look="rows" items={CHECKS} />
              <Text>
                <TextLink to={HOW_IT_WORKS_PATH}>{HOW_IT_WORKS_HEADING}</TextLink> walks through
                each step with real examples.
              </Text>
            </PageSection>
          </Panel>
          <Panel>
            <PageSection id={SECTION.onYou.id} title={SECTION.onYou.title}>
              <IconList label="What's on you" look="rows" items={ON_YOU} />
            </PageSection>
          </Panel>
        </Grid>

        <PageSection id={SECTION.checkYourself.id} title={SECTION.checkYourself.title}>
          <StepList label="Steps" steps={CHECK_IT_YOURSELF} />
          <Text>
            Or start from the <TextLink to={MODS_PATH}>reviewed mods on statuslin.es</TextLink>.
            Each page shows its tiles and links its source at the pinned commit.
          </Text>
        </PageSection>

        <SectionAnchor id={SECTION.faq.id}>
          <FaqSection entries={MOD_SAFETY_FAQ} />
        </SectionAnchor>
      </Stack>
    </DocLayout>
  )
}
