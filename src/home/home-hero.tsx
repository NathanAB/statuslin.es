import { type LucideIcon, Monitor, SquareTerminal } from 'lucide-react'
import { useId, useState } from 'react'
import { useRecordedCopy } from '@/adopt/use-recorded-copy'
import type { HeroSessionKey } from '@/gallery/hero-lines'
import { HeroItemActions } from '@/home/hero-actions'
import { type HeroApp, heroScene } from '@/home/hero-scene'
import { HERO_SESSIONS } from '@/home/hero-sessions'
import type { HeroItem } from '@/home/showcase'
import { useRecordModCopy } from '@/mods/use-record-mod-copy'
import { ChoiceGroup } from '@/ui/choice-group'
import { HeroLayout } from '@/ui/hero-layout'
import { installsLabel } from '@/ui/install-count'
import { SessionStage } from '@/ui/session-stage'
import { Heading, Text } from '@/ui/text'
import { LiveMessage } from '@/ui/visually-hidden'

/** The hero's one sentence beside the title. */
export const HERO_LEAD =
  'Mods change what Claude Code shows. Pick one the community made and see how it looks in the terminal or in Claude Desktop.'

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
const shownSession = (key: HeroSessionKey) =>
  HERO_SESSIONS.find((s) => s.key === key) ?? HERO_SESSIONS[0]
/** The pick as one kind or the other, so each kind's copy hook gets its own id. */
const partsOf = (item: HeroItem | undefined) => ({
  line: item?.kind === 'status-line' ? item.line : undefined,
  mod: item?.kind === 'mod' ? item.mod : undefined,
})

/**
 * The home page's first screen: Claude Code, in the terminal or in Claude Desktop, where the
 * visitor tries on the community's most popular mods, status lines among them, ranked as the
 * gallery ranks them. A status line runs under the prompt in each session; a mod draws where its
 * footprint says, as it was recorded in the Everyday session, so the session is fixed while one is
 * shown, and in Desktop, whose shots are recorded there too. Nothing changes on its own. The first
 * item in the terminal's Everyday session is the server-rendered state, so the page reads whole
 * without JavaScript. Copy installs the shown one through the same prompt as its own page.
 */
export function HomeHero({ heading, items }: { heading: string; items: HeroItem[] }) {
  const [picked, setPicked] = useState(items[0] ? keyOf(items[0]) : '')
  const [app, setApp] = useState<HeroApp>('cli')
  const [sessionKey, setSessionKey] = useState<HeroSessionKey>('clean-main')
  // What the visitor has changed so far: nothing moves until they do.
  const [changed, setChanged] = useState({ pick: false, app: false, session: false })
  const pickerId = useId()
  const appId = useId()
  const sessionId = useId()
  const item = items.find((i) => keyOf(i) === picked) ?? items[0]
  const { line, mod } = partsOf(item)
  // The shown one's copy count, bumped when the visitor copies it, as on its own page.
  const lineCopies = useRecordedCopy(line?.configId ?? '', line?.copyCount ?? 0)
  const modCopies = useRecordModCopy(mod?.modId ?? '', mod?.copyCount ?? 0)
  // Only a status line in the terminal has a render for every session.
  const sessionsApply = app === 'cli' && line !== undefined
  const session = shownSession(sessionsApply ? sessionKey : 'clean-main')

  // With nothing published yet there is nothing to try on; the title and sentence still stand.
  if (!item || !session)
    return (
      <HeroLayout heading={heading} lead={HERO_LEAD} stage={null} picker={null} actions={null} />
    )

  const scene = heroScene(item, app, session)
  const copies = mod ? modCopies : lineCopies
  const anyChange = changed.pick || changed.app || changed.session
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
              {
                title: 'Sample session',
                titleId: sessionId,
                control: (
                  <ChoiceGroup
                    look="tray"
                    labelledBy={sessionId}
                    options={HERO_SESSIONS.map((s) => ({ value: s.key, label: s.label }))}
                    value={session.key}
                    onValueChange={(next) => {
                      setSessionKey(next)
                      change('session')
                    }}
                    disabled={!sessionsApply}
                    wrap
                  />
                ),
              },
            ],
            caption: scene.caption,
            note: scene.sessionFixed,
          }}
          transcript={session.transcript}
          view={scene.view}
          motion={{
            conversationKey: `${app}:${session.key}`,
            conversationChanged: changed.session || changed.app,
            drawnKey: `${keyOf(item)}:${app}:${session.key}`,
            drawnChanged: anyChange,
          }}
        />
      }
      picker={
        <>
          <Heading level={2} size="compact" id={pickerId}>
            Pick a mod
          </Heading>
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
          <HeroItemActions
            item={item}
            count={copies.count}
            onCopied={() => copies.record('prompt')}
          />
          <Text muted size="sm">
            Every mod here is reviewed and rendered in a sandbox before it's listed.
          </Text>
          <LiveMessage>{anyChange ? scene.shown : ''}</LiveMessage>
        </>
      }
    />
  )
}
