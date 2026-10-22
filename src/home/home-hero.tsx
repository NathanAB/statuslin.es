import { type LucideIcon, Monitor, SquareTerminal } from 'lucide-react'
import type { ReactNode } from 'react'
import { useId, useState } from 'react'
import { useRecordedCopy } from '@/adopt/use-recorded-copy'
import { HeroItemActions } from '@/home/hero-actions'
import { type HeroApp, heroScene } from '@/home/hero-scene'
import { HERO_TRANSCRIPT } from '@/home/hero-transcript'
import type { HeroItem } from '@/home/showcase'
import { useRecordModCopy } from '@/mods/use-record-mod-copy'
import { ChoiceGroup } from '@/ui/choice-group'
import { HeroLayout } from '@/ui/hero-layout'
import { installsLabel } from '@/ui/install-count'
import { SessionStage } from '@/ui/session-stage'
import { Text } from '@/ui/text'
import { LiveMessage, VisuallyHidden } from '@/ui/visually-hidden'

/**
 * The hero's two sentences under the title, a line each. It names the three jobs people install and search for
 * most: usage limits, context and git (production installs and Search Console, 2026-10-21).
 */
export const HERO_LEAD = [
  'Track your usage limits, context window, git branch and more.',
  'Pick a mod and see it in action.',
] as const

const APPS: readonly { value: HeroApp; label: string; icon: LucideIcon }[] = [
  { value: 'cli', label: 'Terminal', icon: SquareTerminal },
  { value: 'desktop', label: 'Claude Desktop', icon: Monitor },
]

/** A pick's value in the list: a status line and a mod can share a slug. */
const keyOf = (item: HeroItem) =>
  `${item.kind}:${item.kind === 'mod' ? item.mod.slug : item.line.slug}`
const titleOf = (item: HeroItem) => (item.kind === 'mod' ? item.mod.title : item.line.title)
const copiesOf = (item: HeroItem) =>
  item.kind === 'mod' ? item.mod.copyCount : item.line.copyCount
const KIND_LABEL: Record<HeroItem['kind'], string> = { 'status-line': 'Status line', mod: 'Mod' }
/** The pick as one kind or the other, so each kind's copy hook gets its own id. */
const partsOf = (item: HeroItem | undefined) => ({
  line: item?.kind === 'status-line' ? item.line : undefined,
  mod: item?.kind === 'mod' ? item.mod : undefined,
})

/**
 * The home page's first screen: Claude Code, in the terminal or in Claude Desktop, where the
 * visitor tries on the community's most popular mods, status lines among them, ranked as the
 * gallery ranks them, in the Everyday session (the one mods and Desktop shots are recorded in). A
 * status line runs under the prompt; a mod draws where its footprint says. Nothing changes on its
 * own. The first item in the terminal is the server-rendered state, so the page reads whole without
 * JavaScript. Copy installs the shown one through the same prompt as its own page.
 */
export function HomeHero({ heading, items }: { heading: ReactNode; items: HeroItem[] }) {
  const [picked, setPicked] = useState(items[0] ? keyOf(items[0]) : '')
  const [app, setApp] = useState<HeroApp>('cli')
  // What the visitor has changed so far: nothing moves until they do.
  const [changed, setChanged] = useState({ pick: false, app: false })
  const pickerId = useId()
  const appId = useId()
  const item = items.find((i) => keyOf(i) === picked) ?? items[0]
  const { line, mod } = partsOf(item)
  // The shown one's copy count, bumped when the visitor copies it, as on its own page.
  const lineCopies = useRecordedCopy(line?.configId ?? '', line?.copyCount ?? 0)
  const modCopies = useRecordModCopy(mod?.modId ?? '', mod?.copyCount ?? 0)

  // With nothing published yet there is nothing to try on; the title and sentence still stand.
  if (!item)
    return (
      <HeroLayout heading={heading} lead={HERO_LEAD} stage={null} picker={null} actions={null} />
    )

  const scene = heroScene(item, app)
  const copies = mod ? modCopies : lineCopies
  const anyChange = changed.pick || changed.app
  const change = (what: keyof typeof changed) => setChanged((c) => ({ ...c, [what]: true }))

  return (
    <HeroLayout
      heading={heading}
      lead={HERO_LEAD}
      stage={
        <SessionStage
          label={scene.label}
          toolbar={{
            groups: [
              {
                title: 'Show it in',
                titleId: appId,
                control: (
                  <ChoiceGroup
                    look="tray"
                    labelledBy={appId}
                    options={APPS}
                    value={app}
                    onValueChange={(next) => {
                      setApp(next)
                      change('app')
                    }}
                  />
                ),
              },
            ],
            caption: scene.caption,
          }}
          transcript={HERO_TRANSCRIPT}
          view={scene.view}
          motion={{
            conversationKey: app,
            conversationChanged: changed.app,
            drawnKey: `${keyOf(item)}:${app}`,
            drawnChanged: anyChange,
          }}
        />
      }
      picker={
        <>
          {/* The sentence above already says "Pick a mod", so the list's name is for screen readers. */}
          <VisuallyHidden id={pickerId}>Pick a mod</VisuallyHidden>
          <ChoiceGroup
            look="list"
            rise
            labelledBy={pickerId}
            options={items.map((i) => ({
              value: keyOf(i),
              label: titleOf(i),
              detail: `${KIND_LABEL[i.kind]} · ${installsLabel(i === item ? copies.count : copiesOf(i))}`,
            }))}
            value={keyOf(item)}
            onValueChange={(next) => {
              setPicked(next)
              change('pick')
            }}
          />
        </>
      }
      actions={
        <>
          <HeroItemActions item={item} onCopied={() => copies.record('prompt')} />
          <Text muted size="sm">
            Every mod here is reviewed and rendered in a sandbox before it's listed.
          </Text>
          <LiveMessage>{anyChange ? scene.shown : ''}</LiveMessage>
        </>
      }
    />
  )
}
