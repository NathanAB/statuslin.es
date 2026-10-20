import { useId, useState } from 'react'
import { InstallPromptButton } from '@/adopt/install-prompt-button'
import { useRecordedCopy } from '@/adopt/use-recorded-copy'
import { reachSentence } from '@/gallery/config-install-facts'
import { AuthorByline } from '@/gallery/detail-byline'
import type { HeroLine, HeroSessionKey } from '@/gallery/hero-lines'
import { HERO_SESSIONS } from '@/home/hero-sessions'
import { ChoiceGroup } from '@/ui/choice-group'
import { FactSentence } from '@/ui/fact-sentence'
import { HeroActions, HeroLayout } from '@/ui/hero-layout'
import { installsLabel } from '@/ui/install-count'
import { Terminal } from '@/ui/terminal'
import { Heading, Text, TextLink } from '@/ui/text'
import { LiveMessage, VisuallyHidden } from '@/ui/visually-hidden'

/** The hero's one sentence beside the title. */
export const HERO_LEAD =
  'Mods change what Claude Code shows. The status line is the row under your prompt: pick one the community made and see how it looks in a session.'

/**
 * The home page's first screen: a Claude Code session where the visitor tries on the community's
 * most popular status lines. Picking one, or another session, renders it under the prompt; the
 * session also changes the conversation above it. Nothing changes on its own. The first status
 * line in its Everyday session is the server-rendered state, so the page reads whole without
 * JavaScript. Copy installs the shown one through the same prompt as its own page.
 */
export function HomeHero({ heading, lines }: { heading: string; lines: HeroLine[] }) {
  const [slug, setSlug] = useState(lines[0]?.slug ?? '')
  const [sessionKey, setSessionKey] = useState<HeroSessionKey>('clean-main')
  // What the visitor has changed so far: nothing moves until they do.
  const [changed, setChanged] = useState({ line: false, session: false })
  const pickerId = useId()
  const sessionId = useId()
  const line = lines.find((l) => l.slug === slug) ?? lines[0]
  const session = HERO_SESSIONS.find((s) => s.key === sessionKey) ?? HERO_SESSIONS[0]
  // The shown line's copy count, bumped when the visitor copies it, as on its own page.
  const copies = useRecordedCopy(line?.configId ?? '', line?.copyCount ?? 0)

  // With nothing published yet there is nothing to try on; the title and sentence still stand.
  if (!line || !session)
    return (
      <HeroLayout heading={heading} lead={HERO_LEAD} stage={null} picker={null} actions={null} />
    )

  const pick = (next: string) => {
    setSlug(next)
    setChanged((c) => ({ ...c, line: true }))
  }
  const switchSession = (next: HeroSessionKey) => {
    setSessionKey(next)
    setChanged((c) => ({ ...c, session: true }))
  }
  const anyChange = changed.line || changed.session

  return (
    <HeroLayout
      heading={heading}
      lead={HERO_LEAD}
      stage={
        <Terminal
          label={`Claude Code with ${line.title} under the prompt, in the ${session.label} session`}
          toolbar={{
            title: 'Session',
            titleId: sessionId,
            caption: session.caption,
            control: (
              <ChoiceGroup
                look="tray"
                labelledBy={sessionId}
                options={HERO_SESSIONS.map((s) => ({ value: s.key, label: s.label }))}
                value={session.key}
                onValueChange={switchSession}
              />
            ),
          }}
          transcript={session.transcript}
          status={line.renders[session.key] ?? null}
          conversationKey={session.key}
          conversationChanged={changed.session}
          statusKey={`${line.slug}:${session.key}`}
          statusChanged={anyChange}
        />
      }
      picker={
        <>
          <Heading level={2} size="compact" id={pickerId}>
            Pick a status line
          </Heading>
          <ChoiceGroup
            look="list"
            rise
            labelledBy={pickerId}
            options={lines.map((l) => ({
              value: l.slug,
              label: l.title,
              detail: installsLabel(l.slug === line.slug ? copies.count : l.copyCount),
            }))}
            value={line.slug}
            onValueChange={pick}
          />
        </>
      }
      actions={
        <>
          <HeroActions>
            <InstallPromptButton
              configId={line.configId}
              title={line.title}
              onCopied={() => copies.record('prompt')}
            />
            {/* The same visible words for every status line, so a long title never moves the row. */}
            <TextLink to="/c/$slug" params={{ slug: line.slug }} tone="underlined">
              Open page<VisuallyHidden>: {line.title}</VisuallyHidden>
            </TextLink>
          </HeroActions>
          <AuthorByline author={line.author} after={installsLabel(copies.count)} />
          <FactSentence subject={line.title} fact={reachSentence(line)} />
          <Text muted size="sm">
            Every status line here is reviewed and rendered in a sandbox before it's listed.
          </Text>
          <LiveMessage>
            {anyChange ? `Showing ${line.title} in the ${session.label} session.` : ''}
          </LiveMessage>
        </>
      }
    />
  )
}
