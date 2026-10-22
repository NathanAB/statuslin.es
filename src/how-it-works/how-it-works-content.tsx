import {
  BookOpen,
  Eye,
  EyeOff,
  FileCode,
  Globe,
  Laptop,
  ScanSearch,
  ShieldAlert,
} from 'lucide-react'
import type { HowItWorksExamples } from '@/how-it-works/examples'
import { CHECK_STEP, CHECK_STEPS } from '@/how-it-works/steps'
import { HOW_IT_WORKS_HEADING, MOD_SAFETY_GUIDE_PATH } from '@/lib/page-title'
import { MARKETPLACE_PATH, REPO_URL, SECURITY_POLICY_URL } from '@/lib/site'
import { modInstallFacts } from '@/mods/mod-install-facts'
import { SCENARIO_BY_KEY, SCENARIOS } from '@/render/scenarios'
import { Callout } from '@/ui/callout'
import { DocLayout } from '@/ui/doc-layout'
import { HighlightedCode } from '@/ui/highlighted-code'
import { IconList, type IconListItem } from '@/ui/icon-list'
import { InlineCodeText } from '@/ui/inline-code-text'
import { InstallFacts } from '@/ui/install-facts'
import { Stack } from '@/ui/layout'
import { PageHeader } from '@/ui/page-header'
import { PageSection } from '@/ui/page-section'
import { RuledSections } from '@/ui/ruled-sections'
import { ScenarioRow } from '@/ui/scenario-row'
import { Text, TextLink } from '@/ui/text'

const OPEN_SOURCE = { id: 'all-of-it-is-open-source', title: 'All of it is open source' } as const
const LIMITS = { id: 'what-review-cant-promise', title: "What review can't promise" } as const

/** How many of the example status line's sessions the sandbox step shows. */
const SESSIONS_SHOWN = 3

const REVIEW_LOOKS_AT: IconListItem[] = [
  { icon: FileCode, text: 'Its source, at the pinned version' },
  { icon: Eye, text: 'The previews the sandbox recorded' },
  { icon: Globe, text: 'The hosts it asks to reach, and whether it reads your Claude login' },
  {
    icon: ScanSearch,
    text: (
      <InlineCodeText text="For a mod, the events it hooks and the `$` calls it makes, from `claude plugin validate`" />
    ),
  },
]

const CANT_PROMISE: IconListItem[] = [
  { icon: ShieldAlert, text: "Review lowers the risk. It can't rule it out." },
  { icon: EyeOff, text: 'A reviewer can miss something.' },
  {
    icon: BookOpen,
    text: 'Read the source from its page before you install, and again before you update.',
  },
]

function Pinned({ mod }: { mod: HowItWorksExamples['mod'] }) {
  return (
    <Stack gap={4}>
      <Text>
        A mod is pinned to one commit of its GitHub repository, and a status line to the SHA-256
        hash of its script. Installing gets you that version, whatever the author pushes later.
      </Text>
      {mod ? (
        <Stack gap={2}>
          <HighlightedCode html={mod.entryHtml} />
          <Text muted size="sm">
            {mod.detail.title}'s entry in{' '}
            <TextLink href={MARKETPLACE_PATH}>statuslin.es/marketplace.json</TextLink>, the file
            Claude Code installs mods from.{' '}
            <InlineCodeText text="Its `sha` is the pinned commit." />
          </Text>
        </Stack>
      ) : null}
    </Stack>
  )
}

function Sandboxed({ line }: { line: HowItWorksExamples['line'] }) {
  return (
    <Stack gap={4}>
      <Text>
        Before it's listed, it runs in a fresh sandbox that records the previews on its page. A
        status line runs in {SCENARIOS.length} sample sessions, and a mod in the terminal and in
        Claude Desktop. The sandbox can't reach the internet unless the hosts it needs are approved,
        and it's thrown away after each run.
      </Text>
      {line && line.previews.length > 0 ? (
        <Stack gap={2}>
          <Stack gap={3}>
            {line.previews.slice(0, SESSIONS_SHOWN).map((p) => {
              const scenario = SCENARIO_BY_KEY.get(p.scenarioKey)
              return (
                <ScenarioRow
                  key={p.scenarioKey}
                  shortLabel={scenario?.shortLabel ?? p.scenarioKey}
                  title={scenario?.label ?? p.scenarioKey}
                  segments={p.segments}
                />
              )
            })}
          </Stack>
          <Text muted size="sm">
            {line.title}, as the sandbox recorded it.
          </Text>
        </Stack>
      ) : null}
      <Callout
        title="The sandbox is only for previews"
        icon={<Laptop aria-hidden="true" />}
        description="Installed, a status line or mod runs on your machine with your permissions."
      />
    </Stack>
  )
}

function Reviewed() {
  return (
    <Stack gap={4}>
      <Text>
        A status line with hidden or encoded code, or one that reads credentials such as SSH or AWS
        keys, is refused when it's submitted. Everything else waits in a review queue, and nothing
        goes live on its own. Review looks at:
      </Text>
      <IconList label="What review looks at" look="rows" items={REVIEW_LOOKS_AT} />
      <Text>
        An update is a new version and goes through every step again. The live version stays up
        until the update is approved.
      </Text>
    </Stack>
  )
}

function Listed({ mod }: { mod: HowItWorksExamples['mod'] }) {
  return (
    <Stack gap={4}>
      <Text>
        Its page shows what it can reach, right by the install button. That comes from its footprint
        and the checks on its script, never from the author's description.
      </Text>
      {mod ? (
        <Stack gap={2}>
          <InstallFacts
            heading="What this mod can do"
            headingLevel={3}
            {...modInstallFacts(mod.detail)}
            link={{ label: 'Are mods safe?', to: MOD_SAFETY_GUIDE_PATH }}
          />
          <Text muted size="sm">
            {mod.detail.title}'s panel, as its own page shows it.
          </Text>
        </Stack>
      ) : null}
      <Text>If something turns up after it's listed, the listing can come down at once.</Text>
    </Stack>
  )
}

/**
 * The /how-it-works page body: the four checks every listing passes, each shown with a real
 * listing (the hero's top status line and mod) when there is one, then that all of it is open
 * source, then what review can't promise.
 */
export function HowItWorksContent({ examples }: { examples: HowItWorksExamples }) {
  const { pinned, sandboxed, reviewed, listed } = CHECK_STEP
  return (
    <DocLayout
      contents={[...CHECK_STEPS.map(({ id, title }) => ({ id, title })), OPEN_SOURCE, LIMITS]}
      intro={
        <PageHeader
          title={HOW_IT_WORKS_HEADING}
          lead="Every status line and mod passes these four checks before you can install it, and every update passes them again."
        />
      }
    >
      <RuledSections>
        <PageSection id={pinned.id} step={1} title={pinned.title}>
          <Pinned mod={examples.mod} />
        </PageSection>
        <PageSection id={sandboxed.id} step={2} title={sandboxed.title}>
          <Sandboxed line={examples.line} />
        </PageSection>
        <PageSection id={reviewed.id} step={3} title={reviewed.title}>
          <Reviewed />
        </PageSection>
        <PageSection id={listed.id} step={4} title={listed.title}>
          <Listed mod={examples.mod} />
        </PageSection>
        <PageSection id={OPEN_SOURCE.id} title={OPEN_SOURCE.title}>
          <Text>
            statuslin.es is open source. The sandbox, the checks on submitted scripts, the review
            queue and /marketplace.json are code in its public repository, so you can read exactly
            what each step does.
          </Text>
          <Text>
            Read it at <TextLink href={REPO_URL}>statuslin.es on GitHub</TextLink>. If you find a
            way around a check, <TextLink href={SECURITY_POLICY_URL}>SECURITY.md</TextLink> says how
            to report it.
          </Text>
        </PageSection>
        <PageSection id={LIMITS.id} title={LIMITS.title}>
          <IconList label={LIMITS.title} look="rows" items={CANT_PROMISE} />
          <Text>
            <TextLink to={MOD_SAFETY_GUIDE_PATH}>Are Claude Code mods safe?</TextLink> covers what a
            mod can do once installed and how to check one yourself.
          </Text>
        </PageSection>
      </RuledSections>
    </DocLayout>
  )
}
